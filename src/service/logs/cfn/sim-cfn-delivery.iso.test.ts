import {
  DeleteStackCommand,
  UpdateStackCommand,
} from "@aws-sdk/client-cloudformation";
import { DescribeDeliveriesCommand } from "@aws-sdk/client-cloudwatch-logs";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimAws } from "../../aws/sim-aws.js";
import { jsonStringify } from "../../../util/type-guard/json.js";
import {
  deliveryDistributionLogicalId,
  deliveryDistributionResource,
  deliveryDistributionResourceArn,
} from "../../../../test/logs/delivery-distribution-fixture.js";

const bucketArn = "arn:aws:s3:::example-access-logs";
const sourceName = "site-access-logs";
const suffixPath = "{DistributionId}/{yyyy}/{MM}/{dd}/{HH}";

/**
 * The three Resources a CloudFront standard logging v2 construct is made of.
 */
function loggingTemplate(
  deliveryProperties: SimCfnTemplateValueRecord = {},
  outputFormat = "json",
): CfnTemplateBodyRecord {
  return {
    Resources: {
      [deliveryDistributionLogicalId]: deliveryDistributionResource,
      AccessLogsSource: {
        Type: "AWS::Logs::DeliverySource",
        Properties: {
          Name: sourceName,
          ResourceArn: deliveryDistributionResourceArn,
          LogType: "ACCESS_LOGS",
        },
      },
      AccessLogsDestination: {
        Type: "AWS::Logs::DeliveryDestination",
        Properties: {
          Name: sourceName,
          DestinationResourceArn: bucketArn,
          OutputFormat: outputFormat,
        },
      },
      AccessLogsDelivery: {
        Type: "AWS::Logs::Delivery",
        Properties: {
          DeliverySourceName: { Ref: "AccessLogsSource" },
          DeliveryDestinationArn: {
            "Fn::GetAtt": ["AccessLogsDestination", "Arn"],
          },
          ...deliveryProperties,
        },
      },
    },
    Outputs: {
      SourceName: { Value: { Ref: "AccessLogsSource" } },
      SourceArn: { Value: { "Fn::GetAtt": ["AccessLogsSource", "Arn"] } },
      SourceService: {
        Value: { "Fn::GetAtt": ["AccessLogsSource", "Service"] },
      },
      DestinationName: { Value: { Ref: "AccessLogsDestination" } },
      DestinationType: {
        Value: {
          "Fn::GetAtt": ["AccessLogsDelivery", "DeliveryDestinationType"],
        },
      },
      DeliveryId: { Value: { Ref: "AccessLogsDelivery" } },
      DeliveryArn: { Value: { "Fn::GetAtt": ["AccessLogsDelivery", "Arn"] } },
    },
  };
}

async function deployLogging(
  deliveryProperties: SimCfnTemplateValueRecord = {},
  simAws: SimAws = new SimAws(),
): Promise<{ readonly simAws: SimAws; readonly stack: SimCfnDeployedStack }> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "site-logging",
    template: loggingTemplate(deliveryProperties),
  });

  return { simAws, stack };
}

describe("AWS::Logs delivery Resources", () => {
  it("deploys the three Resources CloudFront logging is made of", async () => {
    // Given a template that turns CloudFront standard logging v2 on, which is
    // these three Resources and nothing else.
    const { simAws, stack } = await deployLogging();

    // Then none of them is recorded as a gap, and the delivery is there to
    // assert on.
    assertArrayLength(stack.skippedResources, 0);

    const described = await simAws
      .logs()
      .describeDeliveries(new DescribeDeliveriesCommand({}));
    const delivery = described.deliveries?.at(0);

    assertNonNullable(delivery);
    assertIdentical(delivery.deliverySourceName, sourceName);
    assertIdentical(delivery.deliveryDestinationType, "S3");
  });

  it("resolves Ref and Fn::GetAtt on all three Resources", async () => {
    // Given the same template, whose outputs name each Resource both ways.
    const { stack } = await deployLogging();
    const sourceArn = stack.outputs.get("SourceArn")?.value;
    const deliveryId = stack.outputs.get("DeliveryId")?.value;
    const deliveryArn = stack.outputs.get("DeliveryArn")?.value;

    // Then Ref is the name for the two Resources the template names, and the
    // identifier CloudWatch Logs issued for the delivery.
    assertIdentical(stack.outputs.get("SourceName")?.value, sourceName);
    assertIdentical(stack.outputs.get("DestinationName")?.value, sourceName);
    assertIdentical(stack.outputs.get("SourceService")?.value, "cloudfront");
    assertIdentical(stack.outputs.get("DestinationType")?.value, "S3");

    assertTypeString(sourceArn);
    assertTypeString(deliveryId);
    assertTypeString(deliveryArn);
    assertStringIncludes(sourceArn, `:delivery-source:${sourceName}`);
    assertStringIncludes(deliveryArn, `:delivery:${deliveryId}`);
  });

  it("joins the delivery to the destination the template built", async () => {
    // Given a template whose delivery names its destination through
    // Fn::GetAtt rather than by a literal ARN.
    const { simAws } = await deployLogging();

    // Then the delivery reaches the destination that Resource created, which
    // is the join the whole stack exists to make.
    const destination = simAws.logs().findDeliveryDestination(sourceName);
    const delivery = simAws.logs().allDeliveries().at(0);

    assertNonNullable(destination);
    assertIdentical(delivery?.deliveryDestinationArn, destination.arn);
  });

  it("carries the S3 layout a template asks for", async () => {
    // Given a template asking for Hive compatible paths under a suffix path.
    const { simAws } = await deployLogging({
      S3SuffixPath: suffixPath,
      S3EnableHiveCompatiblePath: true,
    });

    // Then both reach the delivery, so a test can assert on the layout the
    // bucket will be partitioned by.
    const configuration = simAws
      .logs()
      .allDeliveries()
      .at(0)?.s3DeliveryConfiguration;

    assertNonNullable(configuration);
    assertIdentical(configuration.suffixPath, suffixPath);
    assertTrue(configuration.enableHiveCompatiblePath);
  });

  it("replaces the destination when a template changes its format", async () => {
    // Given a deployed logging stack writing JSON.
    const { simAws } = await deployLogging();

    // When the stack is updated to write plain text, which real CloudWatch
    // Logs refuses to change on a destination that already exists.
    const plainText = jsonStringify(loggingTemplate({}, "plain"));

    await simAws.cloudFormation().updateStack(
      new UpdateStackCommand({
        StackName: "site-logging",
        TemplateBody: plainText,
      }),
    );
    await simAws.cloudFormation().waitForStackUpdateComplete("site-logging");

    // Then the destination was replaced rather than updated, so the format
    // changed. The delivery naming it was replaced with it.
    assertIdentical(
      simAws.logs().findDeliveryDestination(sourceName)?.outputFormat,
      "plain",
    );
    assertArrayLength(simAws.logs().allDeliveries(), 1);
  });

  it("deletes all three when the stack is deleted", async () => {
    // Given the deployed logging stack.
    const { simAws } = await deployLogging();

    // When the stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack(new DeleteStackCommand({ StackName: "site-logging" }));
    await simAws.cloudFormation().waitForStackDeleteComplete("site-logging");

    // Then the account is left with none of them.
    assertArrayEquals(simAws.logs().allDeliverySources(), []);
    assertArrayEquals(simAws.logs().allDeliveryDestinations(), []);
    assertArrayEquals(simAws.logs().allDeliveries(), []);
  });

  it("takes a delivery source over a distribution another stack deployed", async () => {
    // Given a stack holding the distribution and exporting its ARN, which is
    // how an application splits its CDN from the analytics beside it.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.deployTemplate({
      stackName: "site-cdn",
      template: {
        Resources: {
          [deliveryDistributionLogicalId]: deliveryDistributionResource,
        },
        Outputs: {
          DistributionArn: {
            Value: deliveryDistributionResourceArn,
            Export: { Name: "site-cdn:DistributionArn" },
          },
        },
      },
    });

    // When a second stack puts a delivery source over the exported ARN.
    const stack = await cloudFormation.deployTemplate({
      stackName: "site-analytics",
      template: {
        Resources: {
          AccessLogsSource: {
            Type: "AWS::Logs::DeliverySource",
            Properties: {
              Name: sourceName,
              ResourceArn: { "Fn::ImportValue": "site-cdn:DistributionArn" },
              LogType: "ACCESS_LOGS",
            },
          },
        },
      },
    });

    // Then it deploys, because the distribution the ARN names is one the
    // account holds however many stacks away it was created.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertIdentical(
      simAws.logs().findDeliverySource(sourceName)?.service,
      "cloudfront",
    );
  });

  it("records the delivery Resource properties it does not act on", async () => {
    // Given a template tagging its delivery, as a stack usually does.
    const { stack } = await deployLogging({
      Tags: [{ Key: "App", Value: "site" }],
    });
    const ignored = stack
      .getResource("AccessLogsDelivery")
      ?.ignoredProperties.find((property) => property.path === "Tags");

    // Then the delivery is created without them and says so, rather than the
    // whole stack failing over a tag nothing reads back.
    assertNonNullable(ignored);
    assertStringIncludes(ignored.reason, "not simulated");
    assertUndefined(stack.skippedResources.at(0));
  });
});

import {
  assertArrayEmpty,
  assertArrayLength,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";
import { simLogsDeliveryDistributionArn } from "../../../../test/logs/delivery-distribution-fixture.js";

const bucketArn = "arn:aws:s3:::example-access-logs";
const sourceName = "site-access-logs";

/**
 * Every action the three CloudFormation delivery handlers name on refusal.
 *
 * Taken from the `create` handler permissions of AWS::Logs::DeliverySource,
 * AWS::Logs::DeliveryDestination and AWS::Logs::Delivery. The tagging and
 * destination policy actions those handlers also list are left out, because
 * this simulation refuses tags and records a destination policy without acting
 * on it.
 *
 * The CloudFront action is the odd one. CloudWatch Logs checks it as the
 * source over a distribution is put, and a policy assembled from the `logs:`
 * side alone leaves it out.
 */
const deliveryDeployActions = [
  "logs:GetDeliverySource",
  "logs:PutDeliverySource",
  "logs:GetDeliveryDestination",
  "logs:PutDeliveryDestination",
  "logs:GetDelivery",
  "logs:CreateDelivery",
  "cloudfront:AllowVendedLogDeliveryForResource",
];

/**
 * The three Resources CloudFront standard logging v2 is made of.
 *
 * The Distribution is created outside the Stack and named here by its ARN, so
 * the Stack creates nothing of CloudFront. The Role deploying it still needs
 * the one CloudFront permission that delivering a distribution's logs takes.
 */
function loggingTemplate(resourceArn: string): CfnTemplateBodyRecord {
  return {
    Resources: {
      AccessLogsSource: {
        Type: "AWS::Logs::DeliverySource",
        Properties: {
          Name: sourceName,
          ResourceArn: resourceArn,
          LogType: "ACCESS_LOGS",
        },
      },
      AccessLogsDestination: {
        Type: "AWS::Logs::DeliveryDestination",
        Properties: {
          Name: sourceName,
          DestinationResourceArn: bucketArn,
          OutputFormat: "json",
        },
      },
      AccessLogsDelivery: {
        Type: "AWS::Logs::Delivery",
        Properties: {
          DeliverySourceName: { Ref: "AccessLogsSource" },
          DeliveryDestinationArn: {
            "Fn::GetAtt": ["AccessLogsDestination", "Arn"],
          },
        },
      },
    },
  };
}

/**
 * A Role allowed the actions it is given, as a caller a deployment can name.
 */
async function roleAllowing(
  simAws: SimAws,
  roleName: string,
  actions: readonly string[],
): Promise<SimAwsCaller> {
  const role = await simIamRoleWithPolicyFactory.make(
    { roleName, actions },
    simAws,
  );

  return { kind: "arn", arn: role.Arn };
}

/**
 * Deploy the logging Stack as a Role allowed the actions it is given.
 */
async function deployAllowing(
  simAws: SimAws,
  roleName: string,
  actions: readonly string[],
): Promise<SimCfnDeployedStack> {
  const resourceArn = await simLogsDeliveryDistributionArn(simAws);
  const caller = await roleAllowing(simAws, roleName, actions);

  return await simAws.cloudFormation().deployTemplate({
    stackName: "site-logging",
    template: loggingTemplate(resourceArn),
    caller,
  });
}

/**
 * The deploy actions with one of them taken out.
 */
function allBut(action: string): readonly string[] {
  return deliveryDeployActions.filter((allowed) => allowed !== action);
}

describe("the principal an AWS::Logs delivery Resource is created as", () => {
  it("deploys the whole logging Stack as a Role allowed the actions AWS names", async () => {
    // Given a Role holding the create handler permissions of the three
    // delivery Resource types and no listing permission at all.
    const simAws = new SimAws();
    const stack = await deployAllowing(
      simAws,
      "Deployer",
      deliveryDeployActions,
    );

    // Then all three Resources deployed. This is the policy a real
    // CloudFormation refusal sends someone to write, and it has to be enough
    // here.
    assertArrayEmpty(stack.skippedResources);
    assertNonNullable(simAws.logs().findDeliverySource(sourceName));
    assertNonNullable(simAws.logs().findDeliveryDestination(sourceName));
    assertArrayLength(simAws.logs().allDeliveries(), 1);
  });

  it("fails a delivery source under a caller denied logs:GetDeliverySource", async () => {
    // Given a Role allowed to put a delivery source and not to read one. That
    // is the policy Yulin used to send someone away with.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () => {
      await deployAllowing(simAws, "Putter", allBut("logs:GetDeliverySource"));
    });

    // Then the deploy stops on the action a real account stops on, and the
    // source was never put behind the refusal.
    assertStringIncludes(error.message, "logs:GetDeliverySource");
    assertStringIncludes(error.message, "role/Putter");
    assertUndefined(simAws.logs().findDeliverySource(sourceName));
  });

  it("fails a delivery source under a caller denied the CloudFront action", async () => {
    // Given a Role allowed every action the delivery handlers name, and
    // nothing of CloudFront. That is the policy someone writes by asking which
    // service owns the Resource type.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () => {
      await deployAllowing(
        simAws,
        "Logger",
        allBut("cloudfront:AllowVendedLogDeliveryForResource"),
      );
    });

    // Then the deploy stops where the real one stopped, on an action of the
    // service that owns the distribution being logged.
    assertStringIncludes(
      error.message,
      "cloudfront:AllowVendedLogDeliveryForResource",
    );
    assertUndefined(simAws.logs().findDeliverySource(sourceName));
  });

  it("fails a delivery destination under a caller denied logs:GetDeliveryDestination", async () => {
    // Given a Role allowed everything the three handlers name except the read
    // of a delivery destination.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () => {
      await deployAllowing(
        simAws,
        "Putter",
        allBut("logs:GetDeliveryDestination"),
      );
    });

    // Then the destination Resource fails by that name, with the delivery
    // source it follows already deployed.
    assertStringIncludes(error.message, "logs:GetDeliveryDestination");
    assertNonNullable(simAws.logs().findDeliverySource(sourceName));
    assertUndefined(simAws.logs().findDeliveryDestination(sourceName));
  });

  it("fails a delivery under a caller denied logs:GetDelivery", async () => {
    // Given a Role allowed to join a source to a destination and not to read
    // the delivery back.
    const simAws = new SimAws();
    const error = await assertThrowsErrorAsync(async () => {
      await deployAllowing(simAws, "Joiner", allBut("logs:GetDelivery"));
    });

    // Then the delivery Resource fails by that name, with the two Resources it
    // joins already deployed.
    assertStringIncludes(error.message, "logs:GetDelivery");
    assertNonNullable(simAws.logs().findDeliveryDestination(sourceName));
    assertArrayEmpty(simAws.logs().allDeliveries());
  });

  it("tears the delivery source down under the delete action AWS names", async () => {
    // Given the logging Stack deployed by a Role that may create the three
    // Resources and remove only two of them.
    const simAws = new SimAws();
    const stack = await deployAllowing(simAws, "Deployer", [
      ...deliveryDeployActions,
      "logs:DeleteDelivery",
      "logs:DeleteDeliveryDestination",
    ]);

    // When the Stack is torn down.
    const error = await assertThrowsErrorAsync(async () => {
      await stack.teardown();
    });

    // Then the rollback stops on `logs:DeleteDeliverySource`, the way the real
    // one did, and the source is where it was.
    assertStringIncludes(error.message, "logs:DeleteDeliverySource");
    assertNonNullable(simAws.logs().findDeliverySource(sourceName));
  });
});

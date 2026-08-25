import {
  assertArrayLength,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  deliveryDistributionLogicalId,
  deliveryDistributionResource,
  deliveryDistributionResourceArn,
} from "../../../../test/logs/delivery-distribution-fixture.js";

const bucketArn = "arn:aws:s3:::example-access-logs";
const sourceName = "site-access-logs";

async function deploySource(
  properties: SimCfnTemplateValueRecord,
  regionName?: AwsRegionName,
): Promise<void> {
  const simAws = new SimAws();
  const cloudFormation =
    regionName === undefined
      ? simAws.cloudFormation()
      : simAws.account().region(regionName).cloudFormation();

  await cloudFormation.deployTemplate({
    stackName: "site-logging",
    template: {
      Resources: {
        [deliveryDistributionLogicalId]: deliveryDistributionResource,
        AccessLogsSource: {
          Type: "AWS::Logs::DeliverySource",
          Properties: properties,
        },
      },
    },
  });
}

const sourceProperties: SimCfnTemplateValueRecord = {
  Name: sourceName,
  ResourceArn: deliveryDistributionResourceArn,
  LogType: "ACCESS_LOGS",
};

describe("AWS::Logs delivery Resource refusals", () => {
  it("fails a stack whose delivery source names a distribution that is not there", async () => {
    // Given a template pinning the distribution id of a real account, which
    // is how a stack ends up naming one the simulation never created.
    const error = await assertThrowsErrorAsync(async () => {
      await new SimAws().cloudFormation().deployTemplate({
        stackName: "site-logging",
        template: {
          Resources: {
            AccessLogsSource: {
              Type: "AWS::Logs::DeliverySource",
              Properties: {
                Name: sourceName,
                ResourceArn:
                  "arn:aws:cloudfront::888888888888:distribution/E37CHA90H2SDED",
                LogType: "ACCESS_LOGS",
              },
            },
          },
        },
      });
    });

    // Then the deploy fails. The stack would otherwise go up clean against a
    // distribution that delivers nothing.
    assertStringIncludes(error.message, "AccessLogsSource");
    assertStringIncludes(error.message, "names no CloudFront distribution");
  });

  it("fails a stack that sets CloudFront logging up outside us-east-1", async () => {
    // Given the delivery Resources declared in a stack in the region the rest
    // of an application lives in, which is the mistake worth catching.
    const error = await assertThrowsErrorAsync(async () => {
      await deploySource(sourceProperties, "eu-west-2");
    });

    // Then the deploy fails here rather than on a real one later.
    assertStringIncludes(error.message, "only be created in us-east-1");
  });

  it("fails a Resource missing a property the API requires", async () => {
    // Given a template declaring a delivery source with no resource to log.
    const error = await assertThrowsErrorAsync(async () => {
      await deploySource({ Name: sourceName, LogType: "ACCESS_LOGS" });
    });

    // Then it names the Resource and the property, rather than failing later
    // inside the API call.
    assertStringIncludes(error.message, "AccessLogsSource");
    assertStringIncludes(
      error.message,
      "ResourceArn is required on AWS::Logs::DeliverySource",
    );
  });

  it("fails a Resource whose property types the template got wrong", async () => {
    // Given a template giving a string property a value of another type.
    const error = await assertThrowsErrorAsync(async () => {
      await deploySource({ ...sourceProperties, LogType: 42 });
    });

    // Then it says which property was wrong.
    assertStringIncludes(error.message, "LogType must be a string");
  });

  it("fails a delivery whose suffix path names an unknown variable", async () => {
    // Given a whole logging stack whose suffix path has a partition variable
    // spelled the way a template author would guess at it.
    const error = await assertThrowsErrorAsync(async () => {
      await new SimAws().cloudFormation().deployTemplate({
        stackName: "site-logging",
        template: {
          Resources: {
            [deliveryDistributionLogicalId]: deliveryDistributionResource,
            AccessLogsSource: {
              Type: "AWS::Logs::DeliverySource",
              Properties: sourceProperties,
            },
            AccessLogsDestination: {
              Type: "AWS::Logs::DeliveryDestination",
              Properties: {
                Name: sourceName,
                DestinationResourceArn: bucketArn,
              },
            },
            AccessLogsDelivery: {
              Type: "AWS::Logs::Delivery",
              Properties: {
                DeliverySourceName: { Ref: "AccessLogsSource" },
                DeliveryDestinationArn: {
                  "Fn::GetAtt": ["AccessLogsDestination", "Arn"],
                },
                S3SuffixPath: "{DistributionID}/{yyyy}",
              },
            },
          },
        },
      });
    });

    // Then the deploy fails rather than partitioning the bucket by a literal
    // folder named after the variable.
    assertStringIncludes(error.message, "{DistributionID}");
  });

  it("fails a delivery writing the Hive key= segments in its suffix path", async () => {
    // Given a whole logging stack asking for Hive compatible paths and naming
    // the partition keys in the suffix path as well. This is what a CloudFront
    // analytics stack synthesises when it renders the keys by hand.
    const error = await assertThrowsErrorAsync(async () => {
      await new SimAws().cloudFormation().deployTemplate({
        stackName: "site-logging",
        template: {
          Resources: {
            [deliveryDistributionLogicalId]: deliveryDistributionResource,
            AccessLogsSource: {
              Type: "AWS::Logs::DeliverySource",
              Properties: sourceProperties,
            },
            AccessLogsDestination: {
              Type: "AWS::Logs::DeliveryDestination",
              Properties: {
                Name: sourceName,
                DestinationResourceArn: bucketArn,
              },
            },
            AccessLogsDelivery: {
              Type: "AWS::Logs::Delivery",
              Properties: {
                DeliverySourceName: { Ref: "AccessLogsSource" },
                DeliveryDestinationArn: {
                  "Fn::GetAtt": ["AccessLogsDestination", "Arn"],
                },
                S3EnableHiveCompatiblePath: true,
                S3SuffixPath: "year={yyyy}/month={MM}",
              },
            },
          },
        },
      });
    });

    // Then the deploy fails here rather than on a real account, where the
    // doubled key comes back as "Provided suffixPath is invalid".
    assertStringIncludes(error.message, "year={yyyy}");
    assertStringIncludes(error.message, "enableHiveCompatiblePath");
  });

  it("refuses a Resource property read back as an attribute", async () => {
    // Given a template reading DeliveryDestinationType off the delivery
    // destination, which carries it as a property and publishes it on the
    // delivery instead.
    const error = await assertThrowsErrorAsync(async () => {
      await new SimAws().cloudFormation().deployTemplate({
        stackName: "site-logging",
        template: {
          Resources: {
            AccessLogsDestination: {
              Type: "AWS::Logs::DeliveryDestination",
              Properties: {
                Name: sourceName,
                DestinationResourceArn: bucketArn,
              },
            },
          },
          Outputs: {
            Kind: {
              Value: {
                "Fn::GetAtt": [
                  "AccessLogsDestination",
                  "DeliveryDestinationType",
                ],
              },
            },
          },
        },
      });
    });

    // Then it is refused here, as CloudFormation refuses it. Resolving it
    // would give a template that deploys against this simulation and fails
    // against an account.
    assertStringIncludes(
      error.message,
      "Unsupported AWS::Logs::DeliveryDestination attribute " +
        "DeliveryDestinationType",
    );
  });

  it("refuses a delivery attribute CloudFormation does not publish", async () => {
    // Given a template reading an attribute off a delivery source that
    // AWS::Logs::DeliverySource does not have.
    const error = await assertThrowsErrorAsync(async () => {
      await new SimAws().cloudFormation().deployTemplate({
        stackName: "site-logging",
        template: {
          Resources: {
            [deliveryDistributionLogicalId]: deliveryDistributionResource,
            AccessLogsSource: {
              Type: "AWS::Logs::DeliverySource",
              Properties: sourceProperties,
            },
          },
          Outputs: {
            LogType: {
              Value: { "Fn::GetAtt": ["AccessLogsSource", "LogType"] },
            },
          },
        },
      });
    });

    // Then it says which attribute, rather than leaving an Output that
    // quietly resolves to nothing.
    assertStringIncludes(
      error.message,
      "Unsupported AWS::Logs::DeliverySource attribute LogType",
    );
  });

  it("still records a CloudWatch Logs Resource type it has none for", async () => {
    // Given a template declaring a delivery source and a metric filter.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "site-logging",
      template: {
        Resources: {
          [deliveryDistributionLogicalId]: deliveryDistributionResource,
          AccessLogsSource: {
            Type: "AWS::Logs::DeliverySource",
            Properties: sourceProperties,
          },
          SiteMetrics: {
            Type: "AWS::Logs::MetricFilter",
            Properties: { LogGroupName: "/site", FilterPattern: "ERROR" },
          },
        },
      },
    });

    // Then the delivery source deploys and the metric filter is recorded as a
    // gap, which is what adding delivery to this factory must not change.
    assertArrayLength(stack.skippedResources, 1);
    assertStringIncludes(
      stack.skippedResources.at(0)?.skippedReason ?? "",
      "Unsupported sim CloudWatch Logs CloudFormation Resource MetricFilter",
    );
  });
});

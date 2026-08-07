import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import { simCdkBucketNotificationsTemplateFactory } from "./sim-cdk-bucket-notifications-template.factory.js";

/**
 * Deploy a template carrying the given notification configuration, which is
 * expected to fail the Stack, returning the error the deployment gave.
 *
 * The configuration is the whole point of every test here, so the rest of the
 * template stays where the factory put it.
 */
async function deployConfiguration(
  configuration: SimCfnTemplateValueRecord,
): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () => {
    await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCdkBucketNotificationsTemplateFactory.make({
        notificationConfiguration: configuration,
      }),
    });
  });
}

describe("CDK Bucket notifications configuration shape", () => {
  it("refuses a configuration that is not an object", async () => {
    // Given a template whose NotificationConfiguration is a string.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "uploads-stack",
        template: simCdkBucketNotificationsTemplateFactory.make({
          notificationProperties: { NotificationConfiguration: "everything" },
        }),
      });
    });

    // Then the Stack fails naming what was wrong.
    assertStringIncludes(
      error.message,
      "Invalid Custom::S3BucketNotifications Resource BucketNotifications: " +
        "NotificationConfiguration must be an object",
    );
  });

  it("refuses a destination group that is not a list", async () => {
    // Given a configuration whose LambdaFunctionConfigurations is an object.
    // When the template is deployed.
    const error = await deployConfiguration({
      LambdaFunctionConfigurations: {
        Events: ["s3:ObjectCreated:*"],
      },
    });

    // Then the Stack fails naming what was wrong.
    assertStringIncludes(
      error.message,
      "LambdaFunctionConfigurations must be a list",
    );
  });

  it("refuses a configuration entry that is not an object", async () => {
    // Given a configuration listing a string where a configuration belongs.
    // When the template is deployed.
    const error = await deployConfiguration({
      LambdaFunctionConfigurations: ["thumbnailer"],
    });

    // Then the Stack fails naming what was wrong.
    assertStringIncludes(
      error.message,
      "LambdaFunctionConfigurations entry must be an object",
    );
  });

  it("refuses an event that is not a string", async () => {
    // Given a configuration naming its events as numbers.
    // When the template is deployed.
    const error = await deployConfiguration({
      LambdaFunctionConfigurations: [
        {
          Events: [1],
          LambdaFunctionArn: { "Fn::GetAtt": ["Handler", "Arn"] },
        },
      ],
    });

    // Then the Stack fails naming which entry was wrong.
    assertStringIncludes(error.message, "Events entry 0 must be a string");
  });

  it("refuses a function ARN that is not a string", async () => {
    // Given a configuration whose LambdaFunctionArn did not resolve.
    // When the template is deployed.
    const error = await deployConfiguration({
      LambdaFunctionConfigurations: [
        { Events: ["s3:ObjectCreated:*"], LambdaFunctionArn: 12 },
      ],
    });

    // Then the Stack fails naming the property.
    assertStringIncludes(error.message, "LambdaFunctionArn must be a string");
  });

  it("refuses a filter that is not an object", async () => {
    // Given a configuration whose Filter is a string.
    // When the template is deployed.
    const error = await deployConfiguration({
      LambdaFunctionConfigurations: [
        {
          Events: ["s3:ObjectCreated:*"],
          LambdaFunctionArn: { "Fn::GetAtt": ["Handler", "Arn"] },
          Filter: "raw/",
        },
      ],
    });

    // Then the Stack fails naming the property.
    assertStringIncludes(error.message, "Filter must be an object");
  });

  it("refuses filter rules that are not a list", async () => {
    // Given a configuration whose FilterRules is an object.
    // When the template is deployed.
    const error = await deployConfiguration({
      LambdaFunctionConfigurations: [
        {
          Events: ["s3:ObjectCreated:*"],
          LambdaFunctionArn: { "Fn::GetAtt": ["Handler", "Arn"] },
          Filter: { Key: { FilterRules: { Name: "prefix", Value: "raw/" } } },
        },
      ],
    });

    // Then the Stack fails naming the property.
    assertStringIncludes(error.message, "FilterRules must be a list");
  });

  it("refuses a filter rule name that is not a string", async () => {
    // Given a configuration whose filter rule name is a number.
    // When the template is deployed.
    const error = await deployConfiguration({
      LambdaFunctionConfigurations: [
        {
          Events: ["s3:ObjectCreated:*"],
          LambdaFunctionArn: { "Fn::GetAtt": ["Handler", "Arn"] },
          Filter: { Key: { FilterRules: [{ Name: 1, Value: "raw/" }] } },
        },
      ],
    });

    // Then the Stack fails naming the property.
    assertStringIncludes(
      error.message,
      "FilterRules entry Name must be a string",
    );
  });

  it("refuses a queue destination that is not there", async () => {
    // Given the configuration CDK synthesizes for an SQS destination, naming a
    // queue no stack ever created.
    // When the template is deployed.
    const error = await deployConfiguration({
      QueueConfigurations: [
        {
          Events: ["s3:ObjectRemoved:*"],
          QueueArn: "arn:aws:sqs:us-east-1:888888888888:removals",
        },
      ],
    });

    // Then the Stack fails, because a configuration that is accepted and never
    // delivered is worse than one that is refused.
    assertStringIncludes(error.message, "is not a simulated SQS queue");
  });

  it("refuses a topic destination that is not there", async () => {
    // Given the configuration CDK synthesizes for an SnsDestination, naming a
    // topic no stack ever created.
    // When the template is deployed.
    const error = await deployConfiguration({
      TopicConfigurations: [
        {
          Events: ["s3:ObjectRemoved:*"],
          TopicArn: "arn:aws:sns:us-east-1:888888888888:uploads",
        },
      ],
    });

    // Then the Stack fails, because a configuration that is accepted and never
    // delivered is worse than one that is refused.
    assertStringIncludes(error.message, "is not a simulated SNS topic");
  });

  it("refuses an EventBridge destination by name", async () => {
    // Given the configuration CDK synthesizes for `eventBridgeEnabled: true`.
    // When the template is deployed.
    const error = await deployConfiguration({ EventBridgeConfiguration: {} });

    // Then the Stack fails naming the destination.
    assertStringIncludes(
      error.message,
      "Simulated S3 cannot notify a EventBridge",
    );
  });

  it("refuses an EventBridge configuration that is not an object", async () => {
    // Given a configuration whose EventBridgeConfiguration is a list.
    // When the template is deployed.
    const error = await deployConfiguration({ EventBridgeConfiguration: [] });

    // Then the Stack fails on the shape before the destination is reached.
    assertStringIncludes(
      error.message,
      "EventBridgeConfiguration must be an object",
    );
  });
});

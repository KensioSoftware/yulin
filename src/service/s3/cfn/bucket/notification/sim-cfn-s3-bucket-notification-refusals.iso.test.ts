import {
  GetBucketNotificationConfigurationCommand,
  PutBucketNotificationConfigurationCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { simCfnS3BucketNotificationTemplateFactory } from "./sim-cfn-s3-bucket-notification-template.factory.js";

/**
 * Deploy a Bucket carrying the given notification configuration, expecting the
 * Stack to fail, and return the error the deployment gave.
 */
async function deployFailing(
  simAws: SimAws,
  notificationConfiguration: SimCfnTemplateValueRecord,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCfnS3BucketNotificationTemplateFactory.make({
        notificationConfiguration,
      }),
    });
  });
}

describe("AWS::S3::Bucket NotificationConfiguration refusals", () => {
  it("refuses a queue destination the command would refuse from an SDK caller", async () => {
    // Given a template naming a queue no stack ever created.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      QueueConfigurations: [
        {
          Event: "s3:ObjectCreated:*",
          Queue: "arn:aws:sqs:us-east-1:888888888888:uploads",
        },
      ],
    });

    // Then the Stack fails with the refusal
    // PutBucketNotificationConfiguration gives, rather than deploying a Bucket
    // that notifies nothing.
    assertStringIncludes(error.message, "is not a simulated SQS queue");
  });

  it("refuses an event type the command would refuse from an SDK caller", async () => {
    // Given a template naming an event type simulated S3 never raises.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      LambdaConfigurations: [
        {
          Event: "s3:ObjectCreated:CompleteMultipartUpload",
          Function: { "Fn::GetAtt": ["Handler", "Arn"] },
        },
      ],
    });

    // Then the Stack fails with the command's own refusal.
    assertStringIncludes(
      error.message,
      "s3:ObjectCreated:CompleteMultipartUpload",
    );

    // And the Bucket the Resource would have created is not left behind.
    const stack = simAws.cloudFormation().getStackByName("uploads-stack");
    assertNonNullable(stack);
    assertIdentical(stack.getResource("Bucket")?.status, "CREATE_FAILED");
  });

  it("refuses the SDK key filter spelling rather than reading it as unfiltered", async () => {
    // Given a template spelling the key filter the way the SDK spells it,
    // which CloudFormation does not accept.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      LambdaConfigurations: [
        {
          Event: "s3:ObjectCreated:*",
          Function: { "Fn::GetAtt": ["Handler", "Arn"] },
          Filter: { Key: { FilterRules: [{ Name: "prefix", Value: "raw/" }] } },
        },
      ],
    });

    // Then the Stack fails naming the property, rather than deploying an
    // unfiltered configuration.
    assertStringIncludes(
      error.message,
      "Invalid AWS::S3::Bucket NotificationConfiguration in Resource Bucket: " +
        "Key is not a Filter property this simulation reads",
    );
  });

  it("refuses the REST XML key filter rule spelling", async () => {
    // Given a template spelling the rules the way the REST XML spells them.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      LambdaConfigurations: [
        {
          Event: "s3:ObjectCreated:*",
          Function: { "Fn::GetAtt": ["Handler", "Arn"] },
          Filter: {
            S3Key: { FilterRule: [{ Name: "prefix", Value: "raw/" }] },
          },
        },
      ],
    });

    // Then the Stack fails naming the property.
    assertStringIncludes(
      error.message,
      "FilterRule is not a Filter S3Key property this simulation reads",
    );
  });

  it("refuses a LambdaConfigurations entry naming the SDK properties", async () => {
    // Given a template naming a configuration the way the request shape does.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      LambdaFunctionConfigurations: [
        {
          Events: ["s3:ObjectCreated:*"],
          LambdaFunctionArn: { "Fn::GetAtt": ["Handler", "Arn"] },
        },
      ],
    });

    // Then the Stack fails naming the property CloudFormation does not carry.
    assertStringIncludes(
      error.message,
      "LambdaFunctionConfigurations is not a NotificationConfiguration " +
        "property this simulation reads",
    );
  });

  it("refuses a configuration naming no function", async () => {
    // Given a template with a configuration missing its Function.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      LambdaConfigurations: [{ Event: "s3:ObjectCreated:*" }],
    });

    // Then the Stack fails with the command's refusal.
    assertStringIncludes(error.message, "must name a LambdaFunctionArn");
  });

  it("refuses a configuration whose shape is not the one it should be", async () => {
    // Given a template carrying a list where the configuration is an object.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      LambdaConfigurations: { Event: "s3:ObjectCreated:*" },
    });

    // Then the Stack fails naming the level that was wrong.
    assertStringIncludes(
      error.message,
      "Invalid AWS::S3::Bucket NotificationConfiguration in Resource Bucket: " +
        "LambdaConfigurations must be a list",
    );
  });

  it("fails the Stack when nothing permits S3 to invoke the function", async () => {
    // Given a template with no AWS::Lambda::Permission for the function the
    // notification names.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "uploads-stack",
        template: simCfnS3BucketNotificationTemplateFactory.make({
          permitted: false,
        }),
      });
    });

    // Then the Stack fails with the refusal
    // PutBucketNotificationConfiguration gives an SDK caller.
    assertStringIncludes(
      error.message,
      "Unable to validate the following destination configurations",
    );
  });

  it("refuses a topic destination", async () => {
    // Given a template naming an SNS topic destination.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      TopicConfigurations: [
        { Event: "s3:ObjectCreated:*", Topic: "arn:aws:sns:::uploads" },
      ],
    });

    // Then the Stack fails with the command's own refusal.
    assertStringIncludes(
      error.message,
      "Simulated S3 cannot notify a SNS topic",
    );
  });

  it("refuses an EventBridge destination", async () => {
    // Given a template turning EventBridge notifications on.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(simAws, {
      EventBridgeConfiguration: { EventBridgeEnabled: true },
    });

    // Then the Stack fails with the command's own refusal.
    assertStringIncludes(
      error.message,
      "Simulated S3 cannot notify a EventBridge",
    );

    // And no Bucket is left behind carrying a configuration it never got.
    const stack = simAws.cloudFormation().getStackByName("uploads-stack");
    assertNonNullable(stack);
    assertIdentical(stack.getResource("Bucket")?.status, "CREATE_FAILED");
  });

  it("keeps the Bucket's configuration when a later request is refused", async () => {
    // Given a Bucket deployed with a working notification configuration.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCfnS3BucketNotificationTemplateFactory.make({}),
    });
    await stack.waitForDeployComplete();

    // When a request the command refuses is made against the same Bucket.
    await assertThrowsErrorAsync(async () =>
      simAws.s3().putBucketNotificationConfiguration(
        new PutBucketNotificationConfigurationCommand({
          Bucket: "uploads",
          NotificationConfiguration: {
            QueueConfigurations: [
              {
                Events: ["s3:ObjectCreated:*"],
                QueueArn: "arn:aws:sqs:::uploads",
              },
            ],
          },
        }),
      ),
    );

    // Then the Bucket keeps the configuration the template gave it.
    const output = await simAws
      .s3()
      .getBucketNotificationConfiguration(
        new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
      );

    assertArrayLength(output.LambdaFunctionConfigurations ?? [], 1);
  });
});

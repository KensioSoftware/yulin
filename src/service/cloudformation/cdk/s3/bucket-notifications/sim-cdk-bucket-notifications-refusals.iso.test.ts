import { GetBucketNotificationConfigurationCommand } from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { simCdkBucketNotificationsTemplateFactory } from "./sim-cdk-bucket-notifications-template.factory.js";

/**
 * Deploy a notification template that is expected to fail the Stack, returning
 * the error the deployment gave.
 */
async function deployFailing(
  simAws: SimAws,
  template: ReturnType<typeof simCdkBucketNotificationsTemplateFactory.make>,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "uploads-stack", template });
  });
}

/**
 * The Bucket a failed deployment left behind, which should carry no
 * notification configuration at all.
 */
async function configuredNotificationCount(simAws: SimAws): Promise<number> {
  const output = await simAws
    .s3()
    .getBucketNotificationConfiguration(
      new GetBucketNotificationConfigurationCommand({ Bucket: "uploads" }),
    );

  return (output.LambdaFunctionConfigurations ?? []).length;
}

describe("CDK Bucket notifications CloudFormation Custom Resource refusals", () => {
  it("refuses an unmanaged configuration rather than replacing the Bucket's own", async () => {
    // Given the template CDK synthesizes for a Bucket the app imported rather
    // than declared, which asks for a merge instead of a replacement.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(
      simAws,
      simCdkBucketNotificationsTemplateFactory.make({
        notificationProperties: { Managed: false },
      }),
    );

    // Then the Stack fails, naming what the template asked for.
    assertStringIncludes(
      error.message,
      "Invalid Custom::S3BucketNotifications Resource BucketNotifications: " +
        "Managed is false",
    );

    // And the Bucket is left unconfigured.
    assertIdentical(await configuredNotificationCount(simAws), 0);
  });

  it("fails the Stack when nothing permits S3 to invoke the function", async () => {
    // Given a template with no AWS::Lambda::Permission for the function the
    // notification names.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(
      simAws,
      simCdkBucketNotificationsTemplateFactory.make({ permitted: false }),
    );

    // Then the Stack fails with the refusal PutBucketNotificationConfiguration
    // gives, rather than deploying a Bucket that notifies nothing.
    assertStringIncludes(
      error.message,
      "Unable to validate the following destination configurations",
    );

    const stack = simAws.cloudFormation().getStackByName("uploads-stack");
    assertNonNullable(stack);
    assertIdentical(
      stack.getResource("BucketNotifications")?.status,
      "CREATE_FAILED",
    );
    assertIdentical(await configuredNotificationCount(simAws), 0);
  });

  it("fails the Stack for an invalid Resource, where an unsupported one is skipped", async () => {
    // Given a template carrying a custom Resource this simulator has never
    // heard of alongside an invalid notification Resource. The two are worded
    // differently on purpose: an unsupported Resource type is skipped, and a
    // Resource this simulator does support but cannot create as asked is not.
    const simAws = new SimAws();

    // When a template with only the unsupported Resource is deployed.
    const skipStack = await simAws.cloudFormation().deployTemplate({
      stackName: "other-stack",
      template: {
        Resources: {
          Anything: { Type: "Custom::SomethingElse", Properties: {} },
        },
      },
    });
    await skipStack.waitForDeployComplete();

    // Then it is skipped and the Stack still deploys.
    const skipped = skipStack.getResource("Anything");
    assertNonNullable(skipped);
    assertTrue(skipped.skipped);
    assertStringIncludes(
      skipped.skippedReason ?? "",
      "Unsupported sim CloudFormation Custom Resource SomethingElse",
    );

    // And when the invalid notification Resource is deployed, the Stack fails
    // instead.
    const error = await deployFailing(
      simAws,
      simCdkBucketNotificationsTemplateFactory.make({
        notificationProperties: { Managed: false },
      }),
    );
    assertStringIncludes(
      error.message,
      "Invalid Custom::S3BucketNotifications",
    );
  });

  it("refuses a property CDK does not emit", async () => {
    // Given a template carrying a property this simulation knows nothing
    // about.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(
      simAws,
      simCdkBucketNotificationsTemplateFactory.make({
        notificationProperties: { Timeout: 300 },
      }),
    );

    // Then the Stack fails naming the property, rather than ignoring it.
    assertStringIncludes(
      error.message,
      "Timeout is not a Custom::S3BucketNotifications property this " +
        "simulation knows about",
    );
  });

  it("refuses a flag that is neither true nor false", async () => {
    // Given a template whose Managed property is something else.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(
      simAws,
      simCdkBucketNotificationsTemplateFactory.make({
        notificationProperties: { Managed: "yes" },
      }),
    );

    // Then the Stack fails naming the property.
    assertStringIncludes(error.message, "Managed must be true or false");
  });

  it("refuses a Resource that names no Bucket", async () => {
    // Given a template whose BucketName did not resolve to a name.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await deployFailing(
      simAws,
      simCdkBucketNotificationsTemplateFactory.make({
        notificationProperties: { BucketName: "" },
      }),
    );

    // Then the Stack fails naming the property.
    assertStringIncludes(
      error.message,
      "BucketName must resolve to a Bucket name",
    );
  });

  it("leaves the rest of the Stack deployed", async () => {
    // Given a template whose notification Resource is invalid.
    const simAws = new SimAws();

    // When the template is deployed.
    await deployFailing(
      simAws,
      simCdkBucketNotificationsTemplateFactory.make({
        notificationProperties: { Managed: false },
      }),
    );

    // Then the Bucket and the function are still there, so a test can see what
    // the Stack got as far as.
    const stack = simAws.cloudFormation().getStackByName("uploads-stack");
    assertNonNullable(stack);
    assertTrue(stack.getResource("Bucket")?.deployed);
    assertTrue(stack.getResource("Handler")?.deployed);
  });
});

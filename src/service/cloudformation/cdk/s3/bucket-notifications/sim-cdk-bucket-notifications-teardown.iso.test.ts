import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { simCdkBucketNotificationsTemplateFactory } from "./sim-cdk-bucket-notifications-template.factory.js";

describe("CDK Bucket notifications teardown", () => {
  it("empties the notification configuration it put on the Bucket", async () => {
    // Given a deployed Bucket notifying a function, which is what CDK
    // synthesises for bucket.addEventNotification(...).
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "uploads-stack",
      template: simCdkBucketNotificationsTemplateFactory.make({}),
    });
    await stack.waitForDeployComplete();

    const bucket = simAws.s3().getSimBucketByName("uploads");
    assertNonNullable(bucket);
    assertArrayLength(bucket.getNotifications().lambdaNotifications, 1);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the configuration is off the Bucket, as the CDK provider function
    // takes it off on its own Delete event.
    assertArrayLength(bucket.getNotifications().lambdaNotifications, 0);
    assertIdentical(
      stack.getResource("BucketNotifications")?.status,
      "DELETE_COMPLETE",
    );
  });
});

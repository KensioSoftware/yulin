import { assertFalse, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCdkBucketNotificationProperties } from "./sim-cdk-bucket-notification-properties.js";

describe("CDK Bucket notification Resource properties", () => {
  it("takes a Resource stating no flags as managed and validated", () => {
    // Given a Resource carrying only the Bucket and the configuration, which
    // is what a hand-written template can leave the flags out of.
    const properties = new SimCdkBucketNotificationProperties(
      "BucketNotifications",
      {
        BucketName: "uploads",
        NotificationConfiguration: { LambdaFunctionConfigurations: [] },
      },
    );

    // When the flags are read, then they are the ones CDK's own provider
    // function defaults to.
    properties.assertManaged();
    assertFalse(properties.skipDestinationValidation);
    assertIdentical(properties.bucketName, "uploads");
  });
});

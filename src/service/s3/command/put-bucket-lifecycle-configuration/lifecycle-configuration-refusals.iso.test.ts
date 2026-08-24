import {
  CreateBucketCommand,
  PutBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3MalformedXml } from "../../error/sim-s3.error.js";

describe("S3 lifecycle configurations simulated S3 refuses", () => {
  it("refuses a configuration real S3 would refuse to store", async () => {
    // Given a Bucket to configure.
    const simS3 = new SimAws().s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "malformed" }));

    // When a configuration states no rules, and one states a rule with a
    // status S3 has no meaning for.
    const emptyError = await assertThrowsErrorAsync(async () =>
      simS3.putBucketLifecycleConfiguration(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: "malformed",
          LifecycleConfiguration: { Rules: [] },
        }),
      ),
    );
    const statusError = await assertThrowsErrorAsync(async () =>
      simS3.putBucketLifecycleConfiguration(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: "malformed",
          // @ts-expect-error -- testing a status outside the two S3 accepts
          LifecycleConfiguration: { Rules: [{ ID: "off", Status: "Off" }] },
        }),
      ),
    );

    // Then both are refused, so a rule nothing recognises cannot read back
    // looking configured.
    assertInstanceOf(emptyError, SimS3MalformedXml);
    assertInstanceOf(statusError, SimS3MalformedXml);
    assertStringIncludes(statusError.message, "Enabled or Disabled");
  });

  it("refuses a rule that would do nothing", async () => {
    // Given a Bucket to configure.
    const simS3 = new SimAws().s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "idle" }));

    // When a rule states a status and no action to take.
    const error = await assertThrowsErrorAsync(async () =>
      simS3.putBucketLifecycleConfiguration(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: "idle",
          LifecycleConfiguration: {
            Rules: [
              {
                ID: "does-nothing",
                Status: "Enabled",
                Filter: { Prefix: "raw/" },
              },
            ],
          },
        }),
      ),
    );

    // Then it is refused, as real S3 refuses a rule carrying no expiry,
    // transition or upload action.
    assertInstanceOf(error, SimS3MalformedXml);
    assertStringIncludes(error.message, "must state at least one of");
  });

  it("refuses a rule whose only action is an empty list", async () => {
    // Given a Bucket to configure.
    const simS3 = new SimAws().s3();

    await simS3.createBucket(new CreateBucketCommand({ Bucket: "empty" }));

    // When a rule states its transitions, and states none of them.
    const transitionsError = await assertThrowsErrorAsync(async () =>
      simS3.putBucketLifecycleConfiguration(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: "empty",
          LifecycleConfiguration: {
            Rules: [
              { ID: "no-transitions", Status: "Enabled", Transitions: [] },
            ],
          },
        }),
      ),
    );
    const noncurrentError = await assertThrowsErrorAsync(async () =>
      simS3.putBucketLifecycleConfiguration(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: "empty",
          LifecycleConfiguration: {
            Rules: [
              {
                ID: "no-noncurrent-transitions",
                Status: "Enabled",
                NoncurrentVersionTransitions: [],
              },
            ],
          },
        }),
      ),
    );

    // Then both are refused. The field being there does not make the rule do
    // anything, so neither counts as an action.
    assertInstanceOf(transitionsError, SimS3MalformedXml);
    assertInstanceOf(noncurrentError, SimS3MalformedXml);
    assertStringIncludes(
      transitionsError.message,
      "must state at least one of",
    );
  });
});

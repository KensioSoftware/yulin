import {
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  ListMultipartUploadsCommand,
  ListPartsCommand,
  PutBucketLifecycleConfigurationCommand,
  UploadPartCommand,
  type LifecycleRule,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimS3NoSuchUpload } from "../../error/sim-s3.error.js";

const startedAt = new Date("2026-08-24T09:00:00.000Z");

interface StartedUpload {
  readonly simAws: SimAws;
  readonly uploadId: string;
}

/**
 * A Bucket carrying the given rules, with one part of an upload sent under
 * `raw/big.gz` and the rest never sent.
 */
async function abandonedUpload(
  rules: readonly LifecycleRule[],
): Promise<StartedUpload> {
  const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
  const simS3 = simAws.region("eu-west-2").s3();

  await simS3.createBucket(new CreateBucketCommand({ Bucket: "logs" }));
  await simS3.putBucketLifecycleConfiguration(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: "logs",
      LifecycleConfiguration: { Rules: [...rules] },
    }),
  );

  const started = await simS3.createMultipartUpload(
    new CreateMultipartUploadCommand({ Bucket: "logs", Key: "raw/big.gz" }),
  );
  assertDefined(started.UploadId, "the issued upload id");

  await simS3.uploadPart(
    new UploadPartCommand({
      Bucket: "logs",
      Key: "raw/big.gz",
      UploadId: started.UploadId,
      PartNumber: 1,
      Body: "the first part",
    }),
  );

  return { simAws, uploadId: started.UploadId };
}

/**
 * The keys the Bucket's uploads in progress are under.
 */
async function uploadsInProgress(simAws: SimAws): Promise<readonly string[]> {
  const listing = await simAws
    .region("eu-west-2")
    .s3()
    .listMultipartUploads(new ListMultipartUploadsCommand({ Bucket: "logs" }));

  return (listing.Uploads ?? []).map((upload) => upload.Key ?? "");
}

const abortStaleUploads: LifecycleRule = {
  ID: "abort-incomplete-uploads",
  Status: "Enabled",
  Filter: { Prefix: "" },
  AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
};

/**
 * Abandoning a simulated S3 multipart upload nobody finished.
 *
 * An upload holds its parts until something completes or aborts it. A rule
 * stating `AbortIncompleteMultipartUpload` is the third way one ends, and the
 * only one no caller asks for.
 */
describe("Simulated S3 lifecycle abandoned uploads", () => {
  it("keeps an upload the clock has not carried to the abort", async () => {
    // Given a Bucket abandoning uploads a week after they start.
    const { simAws } = await abandonedUpload([abortStaleUploads]);

    // When simulated time moves on by less than a week.
    await simAws.clock().advanceBy({ days: 6 });

    // Then the upload is still in progress.
    const inProgress = await uploadsInProgress(simAws);
    assertIdentical(inProgress.join(","), "raw/big.gz");
  });

  it("drops an upload the moment the clock reaches the abort", async () => {
    // Given a Bucket abandoning uploads a week after they start.
    const { simAws } = await abandonedUpload([abortStaleUploads]);

    // When simulated time reaches the week exactly.
    await simAws.clock().advanceBy({ days: 7 });

    // Then the upload has already gone, because it is abandoned on the
    // boundary rather than some time after it.
    assertArrayLength(await uploadsInProgress(simAws), 0);
  });

  it("takes the abandoned upload's parts with it", async () => {
    // Given a Bucket whose upload the clock has carried past the abort.
    const { simAws, uploadId } = await abandonedUpload([abortStaleUploads]);
    await simAws.clock().advanceBy({ days: 8 });

    // When the parts already sent are listed, and another is sent.
    const listed = await assertThrowsErrorAsync(async () =>
      simAws
        .region("eu-west-2")
        .s3()
        .listParts(
          new ListPartsCommand({
            Bucket: "logs",
            Key: "raw/big.gz",
            UploadId: uploadId,
          }),
        ),
    );
    const sent = await assertThrowsErrorAsync(async () =>
      simAws
        .region("eu-west-2")
        .s3()
        .uploadPart(
          new UploadPartCommand({
            Bucket: "logs",
            Key: "raw/big.gz",
            UploadId: uploadId,
            PartNumber: 2,
            Body: "the second part",
          }),
        ),
    );

    // Then the upload id is as unknown as an aborted one, which is what real
    // S3 leaves behind when it abandons an upload.
    assertInstanceOf(listed, SimS3NoSuchUpload);
    assertInstanceOf(sent, SimS3NoSuchUpload);
  });

  it("leaves an upload outside the rule's prefix in progress", async () => {
    // Given a Bucket abandoning uploads under another prefix.
    const { simAws } = await abandonedUpload([
      { ...abortStaleUploads, Filter: { Prefix: "reports/" } },
    ]);

    // When simulated time moves past the week.
    await simAws.clock().advanceBy({ days: 8 });

    // Then the upload the rule does not select is still in progress.
    const inProgress = await uploadsInProgress(simAws);
    assertIdentical(inProgress.join(","), "raw/big.gz");
  });

  it("leaves an upload in progress for a Disabled rule", async () => {
    // Given a Bucket carrying the same rule, switched off.
    const { simAws } = await abandonedUpload([
      { ...abortStaleUploads, Status: "Disabled" },
    ]);

    // When simulated time moves well past the week.
    await simAws.clock().advanceBy({ days: 60 });

    // Then the upload is still in progress.
    const inProgress = await uploadsInProgress(simAws);
    assertIdentical(inProgress.join(","), "raw/big.gz");
  });

  it("leaves an upload alone for an abort stating no days", async () => {
    // Given a Bucket whose rule states the abort without a number of days.
    const { simAws } = await abandonedUpload([
      { ...abortStaleUploads, AbortIncompleteMultipartUpload: {} },
    ]);

    // When simulated time moves well past anything.
    await simAws.clock().advanceBy({ days: 60 });

    // Then the upload is still in progress. The rule states no boundary for
    // the clock to pass.
    const inProgress = await uploadsInProgress(simAws);
    assertIdentical(inProgress.join(","), "raw/big.gz");
  });

  it("leaves an upload alone for a rule narrowed by object size", async () => {
    // Given a Bucket abandoning uploads of Objects over a kilobyte.
    const { simAws } = await abandonedUpload([
      {
        ...abortStaleUploads,
        Filter: { ObjectSizeGreaterThan: 1024 },
      },
    ]);

    // When simulated time moves past the week.
    await simAws.clock().advanceBy({ days: 8 });

    // Then the upload is still in progress. An upload has no size until its
    // parts are joined, so a size bound selects none of them.
    const inProgress = await uploadsInProgress(simAws);
    assertIdentical(inProgress.join(","), "raw/big.gz");
  });
});

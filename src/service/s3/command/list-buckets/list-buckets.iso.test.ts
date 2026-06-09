import { describe, it } from "vitest";
import { CreateBucketCommand, ListBucketsCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";

describe("S3 ListBucketsCommand", () => {
  it("List all S3 Buckets", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    await Promise.all([
      simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" })),
      simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-b" })),
      simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-c" })),
    ]);

    const listBucketsOutput = await simS3.listBuckets(new ListBucketsCommand());

    assertArrayLength(listBucketsOutput.Buckets, 3);

    assertIdentical(listBucketsOutput.Buckets[0].Name, "bucket-a");
    assertIdentical(listBucketsOutput.Buckets[1].Name, "bucket-b");
    assertIdentical(listBucketsOutput.Buckets[2].Name, "bucket-c");

    assertUndefined(listBucketsOutput.ContinuationToken);
  });

  it("List S3 Buckets with max buckets", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    await Promise.all([
      simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" })),
      simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-b" })),
      simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-c" })),
    ]);

    const listBucketsOutput = await simS3.listBuckets(
      new ListBucketsCommand({ MaxBuckets: 2 }),
    );

    assertArrayLength(listBucketsOutput.Buckets, 2);

    assertIdentical(listBucketsOutput.Buckets[0].Name, "bucket-a");
    assertIdentical(listBucketsOutput.Buckets[1].Name, "bucket-b");
  });

  it("List S3 Buckets with continuation token", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    await Promise.all([
      simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-a" })),
      simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-b" })),
      simS3.createBucket(new CreateBucketCommand({ Bucket: "bucket-c" })),
    ]);

    const firstPage = await simS3.listBuckets(
      new ListBucketsCommand({ MaxBuckets: 2 }),
    );

    const secondPage = await simS3.listBuckets(
      new ListBucketsCommand({
        MaxBuckets: 2,
        ContinuationToken: firstPage.ContinuationToken,
      }),
    );

    assertArrayLength(secondPage.Buckets, 1);

    assertIdentical(secondPage.Buckets[0].Name, "bucket-c");
    assertUndefined(secondPage.ContinuationToken);
  });

  it("List S3 Buckets with prefix", async () => {
    const simAws = new SimAws();

    const simS3 = simAws.s3();

    await Promise.all([
      simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-a" })),
      simS3.createBucket(new CreateBucketCommand({ Bucket: "foo-b" })),
      simS3.createBucket(new CreateBucketCommand({ Bucket: "bar-a" })),
    ]);

    const listBucketsOutput = await simS3.listBuckets(
      new ListBucketsCommand({ Prefix: "foo-" }),
    );

    assertArrayLength(listBucketsOutput.Buckets, 2);

    assertIdentical(listBucketsOutput.Buckets[0].Name, "foo-a");
    assertIdentical(listBucketsOutput.Buckets[1].Name, "foo-b");
    assertIdentical(listBucketsOutput.Prefix, "foo-");
  });
});

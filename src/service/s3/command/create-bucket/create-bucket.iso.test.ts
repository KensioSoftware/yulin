import { describe, it } from "vitest";
import {
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  ListBucketsCommand,
} from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";

describe("S3 CreateBucketCommand", () => {
  it("creates new S3 Bucket", async () => {
    const simAws = new SimAws();
    const simS3 = simAws.account("555555555555").s3();

    const createBucketOutput = await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "foobar-bucket" }),
    );

    assertIdentical(createBucketOutput.BucketArn, "arn:aws:s3:::foobar-bucket");
    assertIdentical(createBucketOutput.Location, "/foobar-bucket");

    const listBucketsOutput = await simS3.listBuckets(new ListBucketsCommand());

    assertArrayLength(listBucketsOutput.Buckets, 1);
    assertIdentical(listBucketsOutput.Buckets[0].Name, "foobar-bucket");
  });

  it("throws on undefined Bucket name", async () => {
    const simAws = new SimAws();
    const simS3 = simAws.region("ap-east-1").s3();

    const error = await assertThrowsErrorAsync(async () =>
      simS3.createBucket(new CreateBucketCommand({ Bucket: undefined })),
    );

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "CreateBucketCommand.input.Bucket must be defined",
    );
  });

  it("throws on duplicate Bucket name in same account and region", async () => {
    const simAws = new SimAws();
    const simS3 = simAws.s3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "foobar-bucket" }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simS3.createBucket(new CreateBucketCommand({ Bucket: "foobar-bucket" })),
    );

    assertInstanceOf(error, BucketAlreadyOwnedByYou);
    assertIdentical(error.$fault, "client");
  });

  it("throws on duplicate Bucket name in another region in the same account", async () => {
    const simAws = new SimAws();
    const euWest1S3 = simAws.account("555555555555").region("eu-west-1").s3();
    const euWest2S3 = simAws.account("555555555555").region("eu-west-2").s3();

    await euWest1S3.createBucket(
      new CreateBucketCommand({ Bucket: "foobar-bucket" }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      euWest2S3.createBucket(
        new CreateBucketCommand({ Bucket: "foobar-bucket" }),
      ),
    );

    assertInstanceOf(error, BucketAlreadyOwnedByYou);
    assertIdentical(error.$fault, "client");
    assertStringIncludes(error.message, "eu-west-1");
    assertStringIncludes(error.message, "555555555555");
  });

  it("throws on duplicate Bucket name in another account in the same region", async () => {
    const simAws = new SimAws();
    const account1S3 = simAws.account("111111111111").region("eu-west-1").s3();
    const account2S3 = simAws.account("222222222222").region("eu-west-1").s3();

    await account1S3.createBucket(
      new CreateBucketCommand({ Bucket: "foobar-bucket" }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      account2S3.createBucket(
        new CreateBucketCommand({ Bucket: "foobar-bucket" }),
      ),
    );

    assertInstanceOf(error, BucketAlreadyExists);
    assertIdentical(error.$fault, "client");
    assertStringIncludes(error.message, "eu-west-1");
    assertStringIncludes(error.message, "111111111111");
  });

  it("throws on duplicate Bucket name in another region and another account", async () => {
    const simAws = new SimAws();
    const account5EuWest1S3 = simAws
      .account("555555555555")
      .region("eu-west-1")
      .s3();
    const account6EuWest2S3 = simAws
      .account("666666666666")
      .region("eu-west-2")
      .s3();

    await account5EuWest1S3.createBucket(
      new CreateBucketCommand({ Bucket: "foobar-bucket" }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      account6EuWest2S3.createBucket(
        new CreateBucketCommand({ Bucket: "foobar-bucket" }),
      ),
    );

    assertInstanceOf(error, BucketAlreadyExists);
    assertIdentical(error.$fault, "client");
    assertStringIncludes(error.message, "eu-west-1");
    assertStringIncludes(error.message, "555555555555");
  });
});

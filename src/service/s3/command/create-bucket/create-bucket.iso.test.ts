import { describe, it } from "vitest";
import {
  BucketAlreadyExists,
  CreateBucketCommand,
  ListBucketsCommand,
} from "@aws-sdk/client-s3";
import { SimAwsAccount } from "../../../organizations/sim-aws-account.js";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";

describe("S3 CreateBucketCommand", () => {
  it("creates new S3 Bucket", async () => {
    const simAccount = new SimAwsAccount();
    const simS3 = simAccount.getS3();

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
    const simAccount = new SimAwsAccount();
    const simS3 = simAccount.getS3();

    const error = await assertThrowsErrorAsync(async () =>
      simS3.createBucket(new CreateBucketCommand({ Bucket: undefined })),
    );

    assertInstanceOf(error, Error);
    assertStringIncludes(
      error.message,
      "CreateBucketCommand.input.Bucket must be defined",
    );
  });

  it("throws on duplicate Bucket name", async () => {
    const simAccount = new SimAwsAccount();
    const simS3 = simAccount.getS3();

    await simS3.createBucket(
      new CreateBucketCommand({ Bucket: "foobar-bucket" }),
    );

    const error = await assertThrowsErrorAsync(async () =>
      simS3.createBucket(new CreateBucketCommand({ Bucket: "foobar-bucket" })),
    );

    assertInstanceOf(error, BucketAlreadyExists);
    assertIdentical(error.$fault, "client");
  });
});

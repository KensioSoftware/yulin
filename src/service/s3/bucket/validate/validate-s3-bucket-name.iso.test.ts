import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3InvalidBucketName } from "../../error/sim-s3.error.js";
import { validateS3BucketName } from "./validate-s3-bucket-name.js";

describe("validateS3BucketName", () => {
  it.each([
    "abc",
    "bucket-name",
    "bucket.name",
    "bucket-name-123",
    "a".repeat(63),
  ])("accepts valid Bucket name %s", (bucketName) => {
    validateS3BucketName(bucketName);
  });

  it.each([
    {
      bucketName: "ab",
      message: "S3 Bucket name must be at least 3 characters long",
    },
    {
      bucketName: "a".repeat(64),
      message: "S3 Bucket name must be no more than 63 characters long",
    },
    {
      bucketName: "Bucket",
      message:
        "S3 Bucket name can consist only of lowercase letters, numbers, periods, and hyphens",
    },
    {
      bucketName: "bucket_name",
      message:
        "S3 Bucket name can consist only of lowercase letters, numbers, periods, and hyphens",
    },
    {
      bucketName: "-bucket",
      message: "S3 Bucket name must begin with a letter or number",
    },
    {
      bucketName: ".bucket",
      message: "S3 Bucket name must begin with a letter or number",
    },
    {
      bucketName: "bucket-",
      message: "S3 Bucket name must end with a letter or number",
    },
    {
      bucketName: "bucket.",
      message: "S3 Bucket name must end with a letter or number",
    },
    {
      bucketName: "bucket..name",
      message: "S3 Bucket name must not contain two adjacent periods",
    },
    {
      bucketName: "192.168.5.4",
      message: "S3 Bucket name must not be formatted as an IP address",
    },
    {
      bucketName: "xn--bucket",
      message: "S3 Bucket name must not start with the prefix xn--",
    },
    {
      bucketName: "sthree-bucket",
      message: "S3 Bucket name must not start with the prefix sthree-",
    },
    {
      bucketName: "amzn-s3-demo-bucket",
      message: "S3 Bucket name must not start with the prefix amzn-s3-demo-",
    },
    {
      bucketName: "bucket-s3alias",
      message: "S3 Bucket name must not end with the suffix -s3alias",
    },
    {
      bucketName: "bucket--ol-s3",
      message: "S3 Bucket name must not end with the suffix --ol-s3",
    },
    {
      bucketName: "bucket.mrap",
      message: "S3 Bucket name must not end with the suffix .mrap",
    },
    {
      bucketName: "bucket--x-s3",
      message: "S3 Bucket name must not end with the suffix --x-s3",
    },
    {
      bucketName: "bucket--table-s3",
      message: "S3 Bucket name must not end with the suffix --table-s3",
    },
  ])(
    "throws a specific InvalidBucketName error for $bucketName",
    ({ bucketName, message }) => {
      const error = assertThrowsError(() => {
        validateS3BucketName(bucketName);
      });

      assertInstanceOf(error, SimS3InvalidBucketName);
      assertIdentical(error.name, "InvalidBucketName");
      assertIdentical(error.message, message);
      assertIdentical(error.$metadata.httpStatusCode, 400);
    },
  );
});

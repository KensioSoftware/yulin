import type { SimS3BucketName } from "../sim-s3-bucket.js";
import { SimS3InvalidBucketName } from "../../error/sim-s3.error.js";

/**
 * Validate that a string is a valid S3 bucket name, or throw.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html
 */
export function validateS3BucketName(
  bucketName: string,
): asserts bucketName is SimS3BucketName {
  if (bucketName.length < 3) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must be at least 3 characters long",
    );
  }

  if (bucketName.length > 63) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must be no more than 63 characters long",
    );
  }

  if (!/^[a-z0-9.-]+$/u.test(bucketName)) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name can consist only of lowercase letters, numbers, periods, and hyphens",
    );
  }

  if (!/^[a-z0-9]/u.test(bucketName)) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must begin with a letter or number",
    );
  }

  if (!/[a-z0-9]$/u.test(bucketName)) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must end with a letter or number",
    );
  }

  if (bucketName.includes("..")) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must not contain two adjacent periods",
    );
  }

  if (isFormattedAsIpAddress(bucketName)) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must not be formatted as an IP address",
    );
  }

  if (bucketName.startsWith("xn--")) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must not start with the prefix xn--",
    );
  }

  if (bucketName.startsWith("sthree-")) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must not start with the prefix sthree-",
    );
  }

  if (bucketName.startsWith("amzn-s3-demo-")) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must not start with the prefix amzn-s3-demo-",
    );
  }

  if (bucketName.endsWith("-s3alias")) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must not end with the suffix -s3alias",
    );
  }

  if (bucketName.endsWith("--ol-s3")) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must not end with the suffix --ol-s3",
    );
  }

  if (bucketName.endsWith(".mrap")) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must not end with the suffix .mrap",
    );
  }

  if (bucketName.endsWith("--x-s3")) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must not end with the suffix --x-s3",
    );
  }

  if (bucketName.endsWith("--table-s3")) {
    throw new SimS3InvalidBucketName(
      "S3 Bucket name must not end with the suffix --table-s3",
    );
  }
}

const graphemeSegmenter = new Intl.Segmenter("en", {
  granularity: "grapheme",
});

function isFormattedAsIpAddress(bucketName: string): boolean {
  const labels = bucketName.split(".");

  return (
    labels.length === 4 &&
    labels.every((label) => {
      return (
        label.length > 0 &&
        label.length <= 3 &&
        [...graphemeSegmenter.segment(label)].every(({ segment }) => {
          return segment >= "0" && segment <= "9";
        })
      );
    })
  );
}

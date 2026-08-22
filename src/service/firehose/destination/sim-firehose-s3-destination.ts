import { SimFirehoseInvalidArgumentException } from "../error/sim-firehose.error.js";
import {
  SimFirehoseBufferingHints,
  type SimFirehoseBufferingHintsInput,
} from "./sim-firehose-buffering-hints.js";

const bucketArnPrefix = "arn:aws:s3:::";

/**
 * An S3 destination as a CreateDeliveryStream request carries it.
 *
 * Both the extended and the plain form arrive in this shape. The extended one
 * carries more fields, and every one this simulation reads is on both.
 */
export interface SimFirehoseS3DestinationInput {
  readonly BucketARN?: string | undefined;
  readonly RoleARN?: string | undefined;
  readonly Prefix?: string | undefined;
  readonly ErrorOutputPrefix?: string | undefined;
  readonly BufferingHints?: SimFirehoseBufferingHintsInput | undefined;
  readonly CompressionFormat?: string | undefined;
}

/**
 * Where one delivery stream writes its buffers, and as whom.
 *
 * The Bucket is held by name rather than by ARN because a PutObject names a
 * Bucket. An S3 Bucket ARN carries no Account and no Region, so the name is all
 * the ARN has to give.
 */
export class SimFirehoseS3Destination {
  public readonly bucketName: string;
  public readonly bucketArn: string;
  public readonly roleArn: string;
  public readonly prefix: string;
  public readonly errorOutputPrefix: string | undefined;
  public readonly bufferingHints: SimFirehoseBufferingHints;

  constructor(input: SimFirehoseS3DestinationInput) {
    this.bucketArn = requireBucketArn(input.BucketARN);
    this.bucketName = this.bucketArn.slice(bucketArnPrefix.length);
    this.roleArn = requireRoleArn(input.RoleARN);
    this.prefix = input.Prefix ?? "";
    this.errorOutputPrefix = input.ErrorOutputPrefix;
    this.bufferingHints = new SimFirehoseBufferingHints(input.BufferingHints);
  }
}

/**
 * Read the Bucket ARN a destination names, or refuse it.
 *
 * A Bucket ARN with a key after the Bucket name is an Object ARN, and a
 * destination naming one has named something Firehose cannot write a buffer to.
 */
function requireBucketArn(value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new SimFirehoseInvalidArgumentException(
      "The S3 destination configuration is missing BucketARN",
    );
  }

  const name = value.startsWith(bucketArnPrefix)
    ? value.slice(bucketArnPrefix.length)
    : "";

  if (name === "" || name.includes("/")) {
    throw new SimFirehoseInvalidArgumentException(
      `The S3 destination BucketARN ${value} does not name a Bucket`,
    );
  }

  return value;
}

function requireRoleArn(value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new SimFirehoseInvalidArgumentException(
      "The S3 destination configuration is missing RoleARN",
    );
  }

  return value;
}

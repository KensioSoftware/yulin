import type { CreateBucketCommand } from "@aws-sdk/client-s3";
import { assertDefined } from "../../../util/defined.js";
import type { Brand } from "../../../util/brand.type.js";

export type S3BucketName = Brand<string, "S3BucketName">;

/**
 * Simulated S3 Bucket.
 */
export class SimS3Bucket {
  public readonly bucketName: string;

  constructor(createCommand: CreateBucketCommand) {
    assertDefined(createCommand.input.Bucket, "createCommand.input.Bucket");
    this.bucketName = createCommand.input.Bucket;
  }
}

import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimS3BucketName } from "../../../s3/bucket/sim-s3-bucket.js";
import { SimS3NoSuchKey } from "../../../s3/error/sim-s3.error.js";
import {
  SimS3Object,
  SimS3ObjectMetadata,
} from "../../../s3/object/s3-object.js";
import type { SimS3 } from "../../../s3/sim-s3.js";
import { simS3BodyToBuffer } from "../../../s3/storage/s3-body-buffer.js";
import type { SimCfS3OriginBucket } from "./sim-cf-s3-origin-bucket.js";

/**
 * Reads Objects for a CloudFront S3 Origin, anonymously.
 *
 * Without an origin access control, CloudFront sends the S3 REST endpoint an
 * unsigned request, so the Bucket policy is the only thing that can make an
 * Object readable. Reading through the ordinary GetObject command is what
 * applies it: a Bucket with no policy answers the Distribution 403 here as it
 * does in real S3.
 */
export class SimCfS3OriginObjectLoader {
  private readonly simS3: SimS3;
  private readonly bucketName: SimS3BucketName;

  constructor(originBucket: SimCfS3OriginBucket) {
    this.simS3 = originBucket.simS3;
    this.bucketName = originBucket.bucket.bucketName;
  }

  /**
   * Load an Object, nothing when the Bucket holds no such key, or the denial
   * when the Bucket policy does not allow the read.
   *
   * A denial is reported rather than raised because it is an Origin response
   * of its own: absence is 404 and denial is 403, and the Distribution can
   * have a different custom error response for each.
   */
  async load(
    objectKey: string,
  ): Promise<SimS3Object | SimIamAccessDenied | undefined> {
    try {
      const output = await this.simS3.getObject(
        { input: { Bucket: this.bucketName, Key: objectKey } },
        { caller: { kind: "anonymous" } },
      );

      return new SimS3Object({
        key: objectKey,
        body: await simS3BodyToBuffer(output.Body as AsyncIterable<Buffer>),
        metadata: new SimS3ObjectMetadata({ ...output.Metadata }),
      });
    } catch (error) {
      if (error instanceof SimS3NoSuchKey) {
        return undefined;
      }

      if (error instanceof SimIamAccessDenied) {
        return error;
      }

      // Anything else is the Bucket itself being unreachable, which the
      // Distribution has no response for and should not hide.
      throw error;
    }
  }
}

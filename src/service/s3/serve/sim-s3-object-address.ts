import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import type { SimS3BucketName } from "../bucket/sim-s3-bucket.js";

/**
 * Which Bucket and Object key an S3 REST request names.
 *
 * S3 has two ways of addressing the same Object. A virtual-hosted style request
 * carries the Bucket in the hostname and nothing but the key in the path; a
 * path style request carries both in the path. The AWS SDK picks between them
 * for itself, so both have to be understood, and the request cannot be served
 * until this is settled.
 */
export class SimS3ObjectAddress {
  public readonly bucketName: SimS3BucketName;
  public readonly objectKey: string;

  private constructor(bucketName: SimS3BucketName, objectKey: string) {
    this.bucketName = bucketName;
    this.objectKey = objectKey;
  }

  /**
   * Read the address out of a REST request, or undefined when it names no
   * Bucket at all.
   *
   * Path segments are decoded one at a time, because a key may itself contain
   * an encoded slash and decoding the whole path first would split the key at
   * a separator that was never there.
   */
  static fromRestRequest(
    target: SimAwsServiceTarget,
    url: URL,
  ): SimS3ObjectAddress | undefined {
    const segments = url.pathname
      .replace(/^\/+/u, "")
      .split("/")
      .map((segment) => decodeURIComponent(segment));

    if (target.resourceName.length > 0) {
      return new SimS3ObjectAddress(
        target.resourceName as SimS3BucketName,
        segments.join("/"),
      );
    }

    const bucketName = segments[0];

    if (bucketName === undefined || bucketName.length === 0) {
      return undefined;
    }

    return new SimS3ObjectAddress(
      bucketName as SimS3BucketName,
      segments.slice(1).join("/"),
    );
  }
}

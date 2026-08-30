import { SimS3Error } from "./sim-s3.error.js";

/**
 * Simulated S3 InvalidBucketState error.
 *
 * A request real S3 refuses because of how the Bucket is configured rather
 * than because of anything in the request. Turning Object Lock on over a
 * Bucket that keeps no versions is the one sim S3 raises it for.
 */
export class SimS3InvalidBucketState extends SimS3Error {
  public override readonly name = "InvalidBucketState";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Simulated S3 ObjectLockConfigurationNotFoundError.
 *
 * What real S3 answers a read of the Object Lock configuration of a Bucket
 * that has never had one, rather than answering with an empty configuration.
 */
export class SimS3ObjectLockConfigurationNotFound extends SimS3Error {
  public override readonly name = "ObjectLockConfigurationNotFoundError";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

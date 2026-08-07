import type { SimS3Bucket } from "../../../s3/bucket/sim-s3-bucket.js";
import type { SimS3 } from "../../../s3/sim-s3.js";

/**
 * The Bucket an S3 Origin serves, with the simulated S3 that holds it.
 *
 * The scope comes along with the Bucket because an Origin reads through that
 * scope's GetObject command rather than out of Bucket storage, so the Bucket
 * policy decides what the Origin can serve, as it does in real S3.
 */
export interface SimCfS3OriginBucket {
  readonly bucket: SimS3Bucket;
  readonly simS3: SimS3;
}

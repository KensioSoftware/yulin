import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimS3Bucket, SimS3BucketName } from "../bucket/sim-s3-bucket.js";

/**
 * The state and collaborators every Bucket-scoped command handler is built
 * with.
 *
 * Each command area holds one of these and hands it straight to the handler it
 * runs, so the same Bucket map, IAM and background scheduler are shared across
 * every command of one simulated S3 scope.
 */
export interface SimS3BucketCommandState {
  readonly buckets: Map<SimS3BucketName, SimS3Bucket>;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

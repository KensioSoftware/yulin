import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimS3Bucket } from "../bucket/sim-s3-bucket.js";

/**
 * A request the static website endpoint should answer, as the caller the
 * authentication boundary resolved.
 *
 * The Bucket's scope is carried because serving goes through that scope's
 * GetObject command, so the website endpoint authorizes exactly as the REST
 * endpoint does.
 */
export interface SimS3WebsiteRoute {
  readonly action: "website";
  readonly bucket: SimS3Bucket;
  readonly bucketScope: SimAwsAccountRegionScope;
  readonly objectKey: string;
}

/**
 * An Object request the REST API endpoint should answer, as the caller the
 * authentication boundary resolved.
 */
export interface SimS3RestObjectRoute {
  readonly action: "restObject";
  readonly bucket: SimS3Bucket;
  readonly bucketScope: SimAwsAccountRegionScope;
  readonly objectKey: string;
}

/**
 * A request that cannot be routed to a simulated S3 action.
 */
export interface SimS3RouteFailure {
  readonly action: "failure";
  readonly statusCode: number;
  readonly message: string;
}

export type SimS3Route =
  SimS3WebsiteRoute | SimS3RestObjectRoute | SimS3RouteFailure;

/**
 * A route that answers the request with a refusal rather than an S3 action.
 */
export function simS3RouteFailure(
  statusCode: number,
  message: string,
): SimS3RouteFailure {
  return { action: "failure", statusCode, message };
}

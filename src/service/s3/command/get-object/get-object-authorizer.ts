import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";
import { simS3AuthorizeAction } from "../authorize/sim-s3-authorize-action.js";
import type { SimS3RequestOptions } from "../sim-s3-request-options.js";

interface GetObjectAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to an S3 GetObject request.
 *
 * A read is authorized against the target Object ARN. A read that finds
 * nothing is authorized a second time, against the Bucket ARN, because real S3
 * decides between AccessDenied and NoSuchKey on `s3:ListBucket`.
 */
export class GetObjectAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: GetObjectAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may read the requested S3 Object.
   */
  authorize(
    bucket: SimS3Bucket,
    key: string,
    options?: SimS3RequestOptions,
  ): void {
    simS3AuthorizeAction({
      iam: this.iam,
      action: "s3:GetObject",
      resource: `arn:aws:s3:::${bucket.bucketName}/${key}`,
      bucket,
      options,
    });
  }

  /**
   * Ensure the caller may be told that the Bucket holds no such key.
   *
   * Which keys a Bucket holds is what a listing tells you. Real S3 admits the
   * absence only to a caller holding `s3:ListBucket` on the Bucket. Everyone
   * else gets the same AccessDenied whether the key is there or not.
   */
  authorizeMissingKey(
    bucket: SimS3Bucket,
    options?: SimS3RequestOptions,
  ): void {
    simS3AuthorizeAction({
      iam: this.iam,
      action: "s3:ListBucket",
      resource: `arn:aws:s3:::${bucket.bucketName}`,
      bucket,
      options,
    });
  }
}

import type { SimIamPolicyDocument } from "../../../iam/policy/sim-iam-policy.js";
import { SimS3AccessDenied } from "../../error/sim-s3.error.js";
import type { SimS3Bucket } from "../sim-s3-bucket.js";
import { SimS3PublicPolicy } from "./sim-s3-public-policy.js";

/**
 * Refuses a Bucket policy that the Bucket's Block Public Access settings do
 * not allow.
 *
 * Real S3 applies this after deciding the caller may set a policy at all, so
 * it refuses a policy the caller is otherwise entitled to apply. Enabling the
 * setting later does not disturb a policy already stored: it governs what may
 * be written, not what is already there.
 */
export class SimS3PublicPolicyGuard {
  private readonly publicPolicy = new SimS3PublicPolicy();

  /**
   * Throw when the Bucket blocks public policies and this document is one.
   */
  guard(bucket: SimS3Bucket, document: SimIamPolicyDocument): void {
    if (!bucket.getPublicAccessBlock().blocksPublicPolicy()) {
      return;
    }

    if (!this.publicPolicy.isPublic(document)) {
      return;
    }

    throw new SimS3AccessDenied(
      `BlockPublicPolicy is enabled on S3 Bucket ${bucket.bucketName}, ` +
        "so a Bucket policy allowing public access is refused",
    );
  }
}

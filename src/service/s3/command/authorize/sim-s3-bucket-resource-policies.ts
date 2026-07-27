import type { SimIamResourcePolicyInput } from "../../../iam/authorize/context/sim-iam-auth-z-context-builder.js";
import { simS3BucketArn } from "../../bucket/sim-s3-bucket-arn.js";
import type { SimS3Bucket } from "../../bucket/sim-s3-bucket.js";

/**
 * The resource policies sim IAM should evaluate for a request against a Bucket.
 *
 * A Bucket policy can grant Bucket-level administration actions in real S3, so
 * the policy administration commands consult it the same way the Object
 * commands do. A Bucket without a policy contributes nothing.
 */
export function simS3BucketResourcePolicies(
  bucket: SimS3Bucket,
): readonly SimIamResourcePolicyInput[] {
  const policy = bucket.getPolicy();

  if (policy === undefined) {
    return [];
  }

  return [
    {
      document: policy,
      policyName: "BucketPolicy",
      resourceArn: simS3BucketArn(bucket.bucketName),
    },
  ];
}

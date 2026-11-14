import type {
  SimIamManagedPolicy,
  SimIamPolicyVersion,
} from "./sim-iam-policy.js";

/**
 * The most versions IAM keeps of one managed policy.
 */
export const maxSimIamPolicyVersions = 5;

/**
 * Every version a managed policy holds, oldest first.
 *
 * A policy that has only ever had one version dates it from the policy's last
 * update. That is its creation for a customer managed policy, and the version
 * AWS last published for an AWS-managed one.
 */
export function simIamPolicyVersions(
  policy: SimIamManagedPolicy,
): readonly SimIamPolicyVersion[] {
  return (
    policy.versions ?? [
      {
        versionId: policy.defaultVersionId,
        document: policy.policyDocument,
        createDate: policy.updateDate,
      },
    ]
  );
}

/**
 * The number of the newest version a managed policy has ever had.
 */
export function simIamLatestPolicyVersionNumber(
  policy: SimIamManagedPolicy,
): number {
  return (
    policy.latestVersionNumber ??
    Math.max(
      ...simIamPolicyVersions(policy).map((version) =>
        Number(version.versionId.slice(1)),
      ),
    )
  );
}

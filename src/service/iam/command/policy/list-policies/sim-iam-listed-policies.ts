import { simIamAwsManagedPolicies } from "../../../policy/aws-managed/sim-iam-aws-managed-policies.js";
import type { SimIamManagedPolicy } from "../../../policy/sim-iam-policy.js";
import type { SimIamPolicyUsage } from "../../../policy/sim-iam-policy-usage.js";
import type { SimListPoliciesCommandInput } from "./list-policies.command.js";

/**
 * The managed policies a ListPolicies request asks for, in ARN order.
 *
 * `Scope` picks the Account's own policies (`Local`), the AWS-managed
 * catalogue (`AWS`) or both (`All`, the default). `OnlyAttached` and
 * `PolicyUsageFilter` read how many entities use each policy.
 */
export function simIamListedPolicies(
  local: Iterable<SimIamManagedPolicy>,
  usage: SimIamPolicyUsage,
  input: SimListPoliciesCommandInput,
): SimIamManagedPolicy[] {
  const {
    Scope,
    OnlyAttached,
    PathPrefix = "/",
    PolicyUsageFilter = "",
  } = input;
  const own = Scope === "AWS" ? [] : [...local];
  const awsManaged = Scope === "Local" ? [] : simIamAwsManagedPolicies();

  const listed = [...own, ...awsManaged]
    .filter((policy) => policy.path.startsWith(PathPrefix))
    .toSorted((a, b) => a.arn.localeCompare(b.arn));

  // Counting what uses a policy scans the Account, so only a filter on it
  // pays for that.
  if (OnlyAttached !== true && PolicyUsageFilter === "") {
    return listed;
  }

  return listed.filter((policy) => {
    const counts = usage(policy.arn);
    const filtered: Readonly<Record<string, number>> = {
      PermissionsPolicy: counts.attachmentCount,
      PermissionsBoundary: counts.permissionsBoundaryUsageCount,
    };

    return (
      (OnlyAttached !== true || counts.attachmentCount > 0) &&
      // oxlint-disable-next-line security/detect-object-injection -- read from a fixed table.
      (filtered[PolicyUsageFilter] ?? 1) > 0
    );
  });
}

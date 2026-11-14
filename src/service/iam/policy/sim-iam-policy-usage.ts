import type { SimArn } from "../../aws/arn.js";

/**
 * Something a managed policy can be attached to, or set as the boundary of.
 */
interface SimIamPolicyUser {
  readonly attachedPolicyArns: ReadonlySet<SimArn>;
  readonly permissionsBoundaryArn?: SimArn | undefined;
}

/**
 * How many entities use a managed policy, as GetPolicy and ListPolicies
 * report it.
 */
export interface SimIamPolicyUsageCounts {
  readonly attachmentCount: number;
  readonly permissionsBoundaryUsageCount: number;
}

/**
 * Count the Roles, Users and groups a managed policy is attached to, and the
 * Roles and Users it is the boundary of.
 */
export type SimIamPolicyUsage = (arn: SimArn) => SimIamPolicyUsageCounts;

/**
 * Make the usage count over the entities an Account holds.
 */
export function simIamPolicyUsage(
  entities: () => Iterable<SimIamPolicyUser>,
): SimIamPolicyUsage {
  return (arn) => {
    const all = [...entities()];

    return {
      attachmentCount: all.filter((each) => each.attachedPolicyArns.has(arn))
        .length,
      permissionsBoundaryUsageCount: all.filter(
        (each) => each.permissionsBoundaryArn === arn,
      ).length,
    };
  };
}

import { faker } from "@faker-js/faker";

import type { JSONString } from "../../../util/type-guard/json.js";
import type { Brand } from "../../../util/brand.type.js";
import type { SimArn } from "../../aws/arn.js";
import type { SimIamPolicyDocument } from "../policy/sim-iam-policy.js";

export type SimIamGroupName = Brand<string, "SimIamGroupName">;
export type SimIamGroupId = Brand<string, "SimIamGroupId">;

/**
 * Account-scoped simulated IAM group.
 *
 * A group is never a principal. Its policies apply to every User in it, and
 * the Users record which groups they are in.
 */
export interface SimIamGroup {
  readonly arn: SimArn;
  readonly groupId: SimIamGroupId;
  readonly groupName: SimIamGroupName;
  readonly path: string;
  readonly creationDate: Date;

  /**
   * Inline identity policies stored directly on the group.
   */
  readonly inlinePolicies: Map<string, JSONString<SimIamPolicyDocument>>;

  /**
   * Managed identity policies attached to the group.
   */
  readonly attachedPolicyArns: Set<SimArn>;
}

/**
 * Generate an AWS-shaped IAM group ID.
 */
export function makeSimIamGroupId(): SimIamGroupId {
  return `AGPA${faker.string
    .alphanumeric({ length: 17 })
    .toUpperCase()}` as SimIamGroupId;
}

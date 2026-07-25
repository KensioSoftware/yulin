import type { JSONString } from "../../../util/type-guard/json.js";
import type { Brand } from "../../../util/brand.type.js";
import type { SimArn } from "../../aws/arn.js";
import type { SimIamPolicyDocument } from "../policy/sim-iam-policy.js";
import type { SimIamPrincipal } from "../principal/sim-iam-principal.js";
import type { SimIamRoleId } from "./sim-iam-role-id.js";

export type SimIamRoleName = Brand<string, "SimIamRoleName">;

export interface SimIamRole extends SimIamPrincipal {
  readonly principalType: "role";
  readonly roleId: SimIamRoleId;
  readonly roleName: SimIamRoleName;
  readonly path: string;

  /**
   * Role trust policy used to authorize sts:AssumeRole-style flows.
   *
   * This is resource-policy-like and must not be evaluated as an ordinary
   * identity permissions policy for service actions.
   */
  readonly assumeRolePolicyDocument?:
    JSONString<SimIamPolicyDocument> | undefined;

  readonly description?: string | undefined;
  readonly creationDate: Date;

  /**
   * Inline identity-based permissions policies stored directly on this role.
   */
  readonly inlinePolicies: Map<string, JSONString<SimIamPolicyDocument>>;

  /**
   * ARNs of managed identity-based permissions policies attached to this role.
   */
  readonly attachedPolicyArns: Set<SimArn>;
}

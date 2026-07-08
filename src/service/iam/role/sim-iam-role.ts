import type { JSONString } from "../../../util/type-guard/json.js";
import type { Brand } from "../../../util/brand.type.js";
import type { SimIamPolicyDocument } from "../policy/sim-iam-policy.js";
import type { SimIamPrincipal } from "../principal/sim-iam-principal.js";
import type { SimIamRoleId } from "./sim-iam-role-id.js";

export type SimIamRoleName = Brand<string, "SimIamRoleName">;

export interface SimIamRole extends SimIamPrincipal {
  readonly principalType: "role";
  readonly roleId: SimIamRoleId;
  readonly roleName: SimIamRoleName;
  readonly path: string;
  readonly assumeRolePolicyDocument?:
    JSONString<SimIamPolicyDocument> | undefined;
  readonly description?: string | undefined;
  readonly createDate: Date;
  readonly inlinePolicies: Map<string, JSONString<SimIamPolicyDocument>>;
  readonly attachedPolicyArns: Set<string>;
}

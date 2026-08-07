import type { JSONString } from "../../../../../util/type-guard/json.js";
import type { SimIamPolicyDocument } from "../../../policy/sim-iam-policy.js";

export interface SimPutRolePolicyCommandInput {
  readonly RoleName?: string | undefined;
  readonly PolicyName?: string | undefined;
  readonly PolicyDocument?:
    | JSONString<SimIamPolicyDocument>
    | string
    | undefined;
}

export interface SimPutRolePolicyCommand {
  readonly input: SimPutRolePolicyCommandInput;
}

export type SimPutRolePolicyCommandOutput = Record<string, never>;

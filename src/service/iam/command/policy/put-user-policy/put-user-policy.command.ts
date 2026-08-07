import type { JSONString } from "../../../../../util/type-guard/json.js";
import type { SimIamPolicyDocument } from "../../../policy/sim-iam-policy.js";

export interface SimPutUserPolicyCommandInput {
  readonly UserName?: string | undefined;
  readonly PolicyName?: string | undefined;
  readonly PolicyDocument?:
    | JSONString<SimIamPolicyDocument>
    | string
    | undefined;
}

export interface SimPutUserPolicyCommand {
  readonly input: SimPutUserPolicyCommandInput;
}

export type SimPutUserPolicyCommandOutput = Record<string, never>;

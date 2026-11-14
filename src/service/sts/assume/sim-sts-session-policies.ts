import type { SimArn } from "../../aws/arn.js";
import type { SimIamSessionPolicy } from "../../iam/credential/session/sim-iam-session-policy.js";
import { simIamManagedPolicyLookup } from "../../iam/policy/sim-iam-managed-policy-lookup.js";
import type { SimIamManagedPolicy } from "../../iam/policy/sim-iam-policy.js";
import { jsonParse } from "../../../util/type-guard/json.js";
import type { SimStsSessionPolicyRequest } from "./sim-sts-session-policy-request.js";

/**
 * The session policies a new session carries, read from the request and from
 * the Role's Account.
 *
 * A managed session policy is read once, when the Role is assumed. An ARN
 * naming no policy the Account holds contributes nothing, and the session it
 * limits is left with whatever the other session policies allow.
 */
export function simStsSessionPolicies(
  request: SimStsSessionPolicyRequest | undefined,
  policies: ReadonlyMap<SimArn, SimIamManagedPolicy>,
): readonly SimIamSessionPolicy[] | undefined {
  if (request === undefined) {
    return undefined;
  }

  const inline =
    request.inline === undefined ? [] : [{ document: request.inline }];

  return [
    ...inline,
    ...request.policyArns.flatMap((arn) => managed(arn as SimArn, policies)),
  ];
}

function managed(
  arn: SimArn,
  policies: ReadonlyMap<SimArn, SimIamManagedPolicy>,
): readonly SimIamSessionPolicy[] {
  const policy = simIamManagedPolicyLookup(policies, arn);

  if (policy?.policyDocument === undefined) {
    return [];
  }

  return [
    {
      document: jsonParse(policy.policyDocument),
      policyName: policy.policyName,
      policyArn: arn,
    },
  ];
}

import { SimIamMalformedPolicyDocument } from "../../iam/error/sim-iam.error.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import { jsonParse } from "../../../util/type-guard/json.js";
import { SimIamPolicyDocumentValidator } from "../../iam/validate/sim-iam-policy-document-validator.js";
import type { SimAssumeRoleCommandInput } from "../command/assume-role/assume-role.command.js";
import type { SimStsAssumeRoleInputLimits } from "./sim-sts-assume-role-input-limits.js";

/**
 * The session policies one AssumeRole request passes.
 */
export interface SimStsSessionPolicyRequest {
  readonly inline: SimIamPolicyDocument | undefined;
  readonly policyArns: readonly string[];
}

/**
 * Read the session policies an AssumeRole request passes, or undefined where
 * it passes none.
 *
 * An inline policy that is not a JSON object is refused the way STS refuses
 * it, and so is one whose statements IAM would refuse.
 */
export function simStsSessionPolicyRequest(
  input: SimAssumeRoleCommandInput,
  limits: SimStsAssumeRoleInputLimits,
): SimStsSessionPolicyRequest | undefined {
  const policyArns = (input.PolicyArns ?? []).flatMap((descriptor) =>
    descriptor.arn === undefined ? [] : [descriptor.arn],
  );

  limits.policyArns(policyArns);

  if (input.Policy === undefined && policyArns.length === 0) {
    return undefined;
  }

  return {
    inline: input.Policy === undefined ? undefined : inlinePolicy(input.Policy),
    policyArns,
  };
}

/**
 * Parse an inline session policy.
 */
function inlinePolicy(text: string): SimIamPolicyDocument {
  let document: unknown;

  try {
    document = JSON.parse(text);
  } catch {
    throw malformed();
  }

  if (typeof document !== "object" || document === null) {
    throw malformed();
  }

  const validator: SimIamPolicyDocumentValidator =
    new SimIamPolicyDocumentValidator();

  validator.validateOptional(text);

  return jsonParse(text);
}

function malformed(): SimIamMalformedPolicyDocument {
  return new SimIamMalformedPolicyDocument(
    "The policy is not in the valid JSON format.",
  );
}

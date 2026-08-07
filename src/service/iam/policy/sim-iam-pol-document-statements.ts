import { SimIamMalformedPolicyDocument } from "../error/sim-iam.error.js";
import type {
  SimIamPolicyDocument,
  SimIamPolicyDocumentStatement,
} from "./sim-iam-policy.js";

type SimIamPolicyStatementField = SimIamPolicyDocument["Statement"];

/**
 * Return the policy document statements as an array, regardless of whether the
 * source document used the single-statement or statement-array shape.
 */
export function simIamPolicyDocumentStatements(
  policyDocument: SimIamPolicyDocument,
): readonly SimIamPolicyDocumentStatement[] {
  const policyStatement = policyDocument.Statement;

  // JSON parse can still produce null at runtime
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  if (policyStatement === undefined || policyStatement === null) {
    throw new SimIamMalformedPolicyDocument(
      "IAM policy document must define Statement",
    );
  }

  if (isSimIamPolicyStatementArray(policyStatement)) {
    return policyStatement;
  }

  return [policyStatement];
}

function isSimIamPolicyStatementArray(
  policyStatement: SimIamPolicyStatementField,
): policyStatement is readonly SimIamPolicyDocumentStatement[] {
  return Array.isArray(policyStatement);
}

import { jsonParse, type JSONString } from "../../../util/type-guard/json.js";
import { SimIamMalformedPolicyDocument } from "../error/sim-iam.error.js";
import { simIamPolicyDocumentStatements } from "../policy/sim-iam-pol-doc-statements.js";
import type { SimIamPolicyDocument } from "../policy/sim-iam-policy.js";

/**
 * Performs basic IAM policy document validation shared by IAM policy commands.
 */
export class SimIamPolicyDocumentValidator {
  /**
   * Validate a required JSON IAM policy document string.
   */
  validateRequired(
    policyDocument: string | undefined,
  ): asserts policyDocument is JSONString<SimIamPolicyDocument> {
    if (policyDocument === undefined || policyDocument.length === 0) {
      throw new Error("PolicyDocument is required");
    }

    this.validate(policyDocument);
  }

  /**
   * Validate an optional JSON IAM policy document string when present.
   */
  validateOptional(
    policyDocument: string | undefined,
  ): asserts policyDocument is JSONString<SimIamPolicyDocument> | undefined {
    if (policyDocument === undefined || policyDocument.length === 0) {
      return;
    }

    this.validate(policyDocument);
  }

  private validate(
    policyDocument: string,
  ): asserts policyDocument is JSONString<SimIamPolicyDocument> {
    const parsedPolicyDocument = jsonParse(
      policyDocument as JSONString<SimIamPolicyDocument>,
    );

    this.validateParsed(parsedPolicyDocument);
  }

  private validateParsed(policyDocument: SimIamPolicyDocument): void {
    for (const statement of simIamPolicyDocumentStatements(policyDocument)) {
      if (statement.Action === undefined && statement.NotAction === undefined) {
        throw new SimIamMalformedPolicyDocument(
          "IAM policy statement must define either Action or NotAction",
        );
      }

      if (
        statement.Resource === undefined &&
        statement.NotResource === undefined
      ) {
        throw new SimIamMalformedPolicyDocument(
          "IAM policy statement must define either Resource or NotResource",
        );
      }
    }
  }
}

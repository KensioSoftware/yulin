import type { JSONString } from "../../../../util/type-guard/json.js";
import { jsonParse } from "../../../../util/type-guard/json.js";
import { SimIamMalformedPolicyDocument } from "../../error/sim-iam.error.js";
import type {
  SimIamPolicyDocument,
  SimIamPolicyDocumentPrincipal,
} from "../../policy/sim-iam-policy.js";
import { simIamPolicyDocumentStatements } from "../../policy/sim-iam-pol-doc-statements.js";

/**
 * Validates an IAM Role trust policy.
 *
 * Trust policies differ from identity policies:
 *
 * - they require Principal or NotPrincipal;
 * - they require Action or NotAction;
 * - Resource and NotResource are not valid because the policy is implicitly
 *   attached to its owning Role.
 */
export class SimIamTrustPolicyDocumentValidator {
  /**
   * Validate a required JSON Role trust-policy document.
   */
  validateRequired(
    policyDocument: string | undefined,
  ): asserts policyDocument is JSONString<SimIamPolicyDocument> {
    if (policyDocument === undefined || policyDocument.length === 0) {
      throw new Error("AssumeRolePolicyDocument is required");
    }

    const parsedPolicyDocument = jsonParse(
      policyDocument as JSONString<SimIamPolicyDocument>,
    );

    this.validateParsed(parsedPolicyDocument);
  }

  private validateParsed(policyDocument: SimIamPolicyDocument): void {
    for (const statement of simIamPolicyDocumentStatements(policyDocument)) {
      // JSON parsing could produce any value so we have to runtime validate.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (statement.Effect !== "Allow" && statement.Effect !== "Deny") {
        throw new SimIamMalformedPolicyDocument(
          'IAM trust policy statement Effect must be either "Allow" or "Deny"',
        );
      }

      if (statement.Action === undefined && statement.NotAction === undefined) {
        throw new SimIamMalformedPolicyDocument(
          "IAM trust policy statement must define either Action or NotAction",
        );
      }

      if (
        statement.Principal === undefined &&
        statement.NotPrincipal === undefined
      ) {
        throw new SimIamMalformedPolicyDocument(
          "IAM trust policy statement must define either Principal or NotPrincipal",
        );
      }

      if (
        statement.Principal !== undefined &&
        statement.NotPrincipal !== undefined
      ) {
        throw new SimIamMalformedPolicyDocument(
          "IAM trust policy statement cannot define both Principal and NotPrincipal",
        );
      }

      if (
        statement.Resource !== undefined ||
        statement.NotResource !== undefined
      ) {
        throw new SimIamMalformedPolicyDocument(
          "IAM trust policy statement cannot define Resource or NotResource",
        );
      }

      if (statement.Principal !== undefined) {
        this.validatePrincipal(statement.Principal);
      }

      if (statement.NotPrincipal !== undefined) {
        this.validatePrincipal(statement.NotPrincipal);
      }
    }
  }

  private validatePrincipal(principal: SimIamPolicyDocumentPrincipal): void {
    if (typeof principal === "string") {
      this.validatePrincipalValue(principal);
      return;
    }

    if (Array.isArray(principal)) {
      for (const value of principal) {
        this.validatePrincipalValue(value as string);
      }
      return;
    }

    for (const [principalType, values] of Object.entries(principal)) {
      if (principalType !== "AWS" && principalType !== "Service") {
        throw new SimIamMalformedPolicyDocument(
          `Unsupported IAM trust policy principal type: ${principalType}`,
        );
      }

      if (typeof values === "string") {
        this.validatePrincipalValue(values);
        continue;
      }

      for (const value of values) {
        this.validatePrincipalValue(value);
      }
    }
  }

  private validatePrincipalValue(value: string): void {
    if (value.length === 0) {
      throw new SimIamMalformedPolicyDocument(
        "IAM trust policy principal cannot be empty",
      );
    }
  }
}

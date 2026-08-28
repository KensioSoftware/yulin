import { jsonParse, type JSONString } from "../../../util/type-guard/json.js";
import { SimIamMalformedPolicyDocument } from "../error/sim-iam.error.js";
import { simIamPolicyDocumentStatements } from "../policy/sim-iam-pol-document-statements.js";
import type {
  SimIamPolicyDocument,
  SimIamPolicyDocumentStatement,
} from "../policy/sim-iam-policy.js";
import {
  simIamStatementLabel,
  type SimIamPolicyDocumentSubject,
} from "../policy/sim-iam-statement-label.js";
import { simIamStatementStrings } from "../policy/sim-iam-statement-strings.js";

/**
 * Performs basic IAM policy document validation shared by IAM policy commands.
 *
 * A caller can say what the document is attached to, and a rejection names it.
 * Malformed documents usually arrive from a CloudFormation template, and the
 * failure has to carry enough for a reader to find the template that wrote
 * it.
 */
export class SimIamPolicyDocumentValidator {
  /**
   * Validate a required JSON IAM policy document string.
   */
  validateRequired(
    policyDocument: string | undefined,
    subject?: SimIamPolicyDocumentSubject,
  ): asserts policyDocument is JSONString<SimIamPolicyDocument> {
    if (policyDocument === undefined || policyDocument.length === 0) {
      throw new Error("PolicyDocument is required");
    }

    this.validate(policyDocument, subject);
  }

  /**
   * Validate an optional JSON IAM policy document string when present.
   */
  validateOptional(
    policyDocument: string | undefined,
    subject?: SimIamPolicyDocumentSubject,
  ): asserts policyDocument is JSONString<SimIamPolicyDocument> | undefined {
    if (policyDocument === undefined || policyDocument.length === 0) {
      return;
    }

    this.validate(policyDocument, subject);
  }

  private validate(
    policyDocument: string,
    subject: SimIamPolicyDocumentSubject | undefined,
  ): asserts policyDocument is JSONString<SimIamPolicyDocument> {
    const parsedPolicyDocument = jsonParse(
      policyDocument as JSONString<SimIamPolicyDocument>,
    );

    this.validateParsed(parsedPolicyDocument, subject);
  }

  private validateParsed(
    policyDocument: SimIamPolicyDocument,
    subject: SimIamPolicyDocumentSubject | undefined,
  ): void {
    const statements = simIamPolicyDocumentStatements(policyDocument);

    for (const [index, statement] of statements.entries()) {
      this.validateStatement(statement, simIamStatementLabel(index, subject));
    }
  }

  private validateStatement(
    statement: SimIamPolicyDocumentStatement,
    label: string,
  ): void {
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    if (statement.Effect !== "Allow" && statement.Effect !== "Deny") {
      throw new SimIamMalformedPolicyDocument(
        `${label}: Effect must be either "Allow" or "Deny"`,
      );
    }

    if (statement.Action === undefined && statement.NotAction === undefined) {
      throw new SimIamMalformedPolicyDocument(
        `${label}: must define either Action or NotAction`,
      );
    }

    if (
      statement.Resource === undefined &&
      statement.NotResource === undefined
    ) {
      throw new SimIamMalformedPolicyDocument(
        `${label}: must define either Resource or NotResource`,
      );
    }

    // Read for the types alone. A field of the wrong type throws while the
    // document is still beside the call that wrote it. Left to the first
    // authorization, the same fault names no policy at all.
    simIamStatementStrings(statement.Action, label, "Action");
    simIamStatementStrings(statement.NotAction, label, "NotAction");
    simIamStatementStrings(statement.Resource, label, "Resource");
    simIamStatementStrings(statement.NotResource, label, "NotResource");
  }
}

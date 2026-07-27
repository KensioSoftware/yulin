import { simIamPolicyDocumentStatements } from "../../../iam/policy/sim-iam-pol-document-statements.js";
import type {
  SimIamPolicyDocument,
  SimIamPolicyDocumentStatement,
} from "../../../iam/policy/sim-iam-policy.js";
import { simS3ConditionPinsPrincipal } from "./sim-s3-pinning-condition.js";
import { simS3PrincipalIsWildcard } from "./sim-s3-public-principal.js";

/**
 * Decides whether a Bucket policy allows public access, which is what S3 Block
 * Public Access judges a PutBucketPolicy call against.
 *
 * Real S3 starts by assuming a policy is public and looks for a reason it is
 * not: a statement qualifies as non-public only when it grants access to fixed
 * values. The simulator follows the same direction, so anything it cannot
 * classify stays public and gets refused.
 */
export class SimS3PublicPolicy {
  /**
   * Whether any statement in the document grants public access.
   */
  isPublic(document: SimIamPolicyDocument): boolean {
    return simIamPolicyDocumentStatements(document).some((statement) =>
      this.statementIsPublic(statement),
    );
  }

  private statementIsPublic(statement: SimIamPolicyDocumentStatement): boolean {
    if (statement.Effect !== "Allow") {
      return false;
    }

    // NotPrincipal grants to everyone except the listed identities, which is
    // public by any reading.
    if (statement.NotPrincipal !== undefined) {
      return true;
    }

    if (!simS3PrincipalIsWildcard(statement.Principal)) {
      return false;
    }

    return !simS3ConditionPinsPrincipal(statement.Condition);
  }
}

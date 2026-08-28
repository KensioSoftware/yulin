import type {
  SimIamPolicyDocument,
  SimIamPolicyDocumentCondition,
  SimIamPolicyDocumentPrincipal,
  SimIamPolicyDocumentStatement,
} from "../sim-iam-policy.js";
import { simIamPolicyDocumentStatements } from "../sim-iam-pol-document-statements.js";
import { simIamStatementLabel } from "../sim-iam-statement-label.js";
import { simIamStatementStrings } from "../sim-iam-statement-strings.js";

export interface SimIamParsedPolicyDocument {
  readonly statements: readonly SimIamParsedPolicyStatement[];
}

export interface SimIamParsedPolicyStatement {
  readonly source: SimIamPolicyDocumentStatement;
  readonly sid?: string | undefined;
  readonly effect: "Allow" | "Deny";
  readonly actions?: readonly string[] | undefined;
  readonly notActions?: readonly string[] | undefined;
  readonly resources?: readonly string[] | undefined;
  readonly notResources?: readonly string[] | undefined;
  readonly principal?: SimIamPolicyDocumentPrincipal | undefined;
  readonly notPrincipal?: SimIamPolicyDocumentPrincipal | undefined;
  readonly condition?: SimIamPolicyDocumentCondition | undefined;
}

/**
 * Parse raw IAM policy document shapes into a form convenient for evaluation.
 *
 * IAM policy JSON commonly allows either a single value or an array. The decision
 * engine should not need to care which source shape was used.
 *
 * A document stored without validation can hold a value of the wrong type in
 * one of those fields. Parsing it reports a malformed policy naming the
 * statement.
 */
export class SimIamPolicyDocumentParser {
  /**
   * Parse a sim IAM Policy Document into a form convenient for evaluation.
   */
  parse(policy: SimIamPolicyDocument): SimIamParsedPolicyDocument {
    return {
      statements: simIamPolicyDocumentStatements(policy).map(
        (statement, index) => this.parseStatement(statement, index),
      ),
    };
  }

  private parseStatement(
    statement: SimIamPolicyDocumentStatement,
    index: number,
  ): SimIamParsedPolicyStatement {
    const label = simIamStatementLabel(index);

    return {
      source: statement,
      sid: statement.Sid,
      effect: statement.Effect,
      actions: simIamStatementStrings(statement.Action, label, "Action"),
      notActions: simIamStatementStrings(
        statement.NotAction,
        label,
        "NotAction",
      ),
      resources: simIamStatementStrings(statement.Resource, label, "Resource"),
      notResources: simIamStatementStrings(
        statement.NotResource,
        label,
        "NotResource",
      ),
      principal: statement.Principal,
      notPrincipal: statement.NotPrincipal,
      condition: statement.Condition,
    };
  }
}

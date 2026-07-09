import type {
  SimIamPolicyDocument,
  SimIamPolicyDocumentCondition,
  SimIamPolicyDocumentPrincipal,
  SimIamPolicyDocumentStatement,
} from "../sim-iam-policy.js";
import { simIamPolicyDocumentStatements } from "../sim-iam-pol-doc-statements.js";

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
 */
export class SimIamPolicyDocumentParser {
  /**
   * Parse a sim IAM Policy Document into a form convenient for evaluation.
   */
  parse(policy: SimIamPolicyDocument): SimIamParsedPolicyDocument {
    return {
      statements: simIamPolicyDocumentStatements(policy).map((statement) =>
        this.parseStatement(statement),
      ),
    };
  }

  private parseStatement(
    statement: SimIamPolicyDocumentStatement,
  ): SimIamParsedPolicyStatement {
    return {
      source: statement,
      sid: statement.Sid,
      effect: statement.Effect,
      actions: this.stringList(statement.Action),
      notActions: this.stringList(statement.NotAction),
      resources: this.stringList(statement.Resource),
      notResources: this.stringList(statement.NotResource),
      principal: statement.Principal,
      notPrincipal: statement.NotPrincipal,
      condition: statement.Condition,
    };
  }

  private stringList(
    value: string | readonly string[] | undefined,
  ): readonly string[] | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === "string") {
      return [value];
    }

    return [...value];
  }
}

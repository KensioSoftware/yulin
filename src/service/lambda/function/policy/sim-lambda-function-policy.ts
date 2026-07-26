import { randomUUID } from "node:crypto";

import type { SimIamPolicyDocument } from "../../../iam/policy/sim-iam-policy.js";
import {
  SimLambdaResourceConflictException,
  SimLambdaResourceNotFoundException,
} from "../../error/sim-lambda.error.js";
import type { SimLambdaPermission } from "./sim-lambda-permission.js";

/**
 * The name real Lambda gives a function's resource policy document.
 */
const policyId = "default";

/**
 * A simulated Lambda function's resource-based policy.
 *
 * This is the other half of Lambda authorization. An identity policy says what
 * a principal may do; this says who may act on the function, which is the only
 * way a principal in another Account can be allowed anything at all, since its
 * own Account's policies are not evaluated here.
 *
 * Statements are keyed by their `StatementId`, because that is how
 * `AddPermission` and `RemovePermission` address them.
 */
export class SimLambdaFunctionPolicy {
  private readonly permissions = new Map<string, SimLambdaPermission>();
  #revisionId = randomUUID();

  /**
   * The revision the policy is currently at, which changes with every grant
   * and revocation.
   */
  get revisionId(): string {
    return this.#revisionId;
  }

  /**
   * Whether this function has no resource policy at all.
   *
   * Real Lambda has no empty policy: a function either has one or `GetPolicy`
   * reports that it does not.
   */
  isEmpty(): boolean {
    return this.permissions.size === 0;
  }

  /**
   * The permission a statement id names, if this policy has one.
   */
  get(statementId: string): SimLambdaPermission | undefined {
    return this.permissions.get(statementId);
  }

  /**
   * Grant a permission, refusing a statement id already in use.
   */
  add(permission: SimLambdaPermission): void {
    if (this.permissions.has(permission.statementId)) {
      throw new SimLambdaResourceConflictException(
        `The statement id (${permission.statementId}) provided already ` +
          `exists. Please provide a new statement id, or remove the ` +
          `existing statement.`,
      );
    }

    this.permissions.set(permission.statementId, permission);
    this.#revisionId = randomUUID();
  }

  /**
   * Revoke a permission by its statement id, failing as AWS does when no
   * statement has it.
   */
  remove(statementId: string): void {
    if (!this.permissions.delete(statementId)) {
      throw new SimLambdaResourceNotFoundException(
        `Statement ${statementId} is not found in resource policy.`,
      );
    }

    this.#revisionId = randomUUID();
  }

  /**
   * The policy document, in the shape `GetPolicy` returns and IAM evaluates.
   */
  document(): SimIamPolicyDocument {
    return {
      Version: "2012-10-17",
      Id: policyId,
      Statement: this.permissions
        .values()
        .map((permission) => permission.toStatement())
        .toArray(),
    };
  }
}

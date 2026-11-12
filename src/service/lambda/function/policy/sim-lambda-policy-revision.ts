import { SimLambdaPreconditionFailedException } from "../../error/sim-lambda.error.js";
import type { SimLambdaFunctionPolicy } from "./sim-lambda-function-policy.js";

/**
 * Refuse a permission change naming a `RevisionId` the policy has moved on
 * from, as real AddPermission and RemovePermission refuse one.
 *
 * The revision is the policy's own, which `GetPolicy` reports.
 */
export function simLambdaAssertPolicyRevision(
  policy: SimLambdaFunctionPolicy,
  revisionId: string | undefined,
): void {
  if (revisionId !== undefined && revisionId !== policy.revisionId) {
    throw new SimLambdaPreconditionFailedException(
      "The Revision Id provided does not match the latest Revision Id. " +
        "Call the GetPolicy API to retrieve the latest Revision Id",
    );
  }
}

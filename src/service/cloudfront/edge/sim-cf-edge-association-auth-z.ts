import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";

/**
 * What a caller needs on the function version to put it in front of a
 * Distribution.
 *
 * `GetFunction` is how CloudFront reads the code and configuration, and
 * `EnableReplication` is what lets the replication service copy it out to the
 * edge. A policy written the way the AWS docs write it grants
 * `lambda:EnableReplication*`, which matches this.
 */
const associationActions = ["lambda:GetFunction", "lambda:EnableReplication"];

/**
 * Check the caller may put this function version in front of a Distribution.
 */
export function authorizeEdgeAssociation(
  iam: SimIamInterServiceAuthZ,
  functionArn: string,
  caller?: SimAwsCaller,
): void {
  for (const action of associationActions) {
    const decision = iam.authorize({ action, resource: functionArn, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action,
        resource: functionArn,
      });
    }
  }
}

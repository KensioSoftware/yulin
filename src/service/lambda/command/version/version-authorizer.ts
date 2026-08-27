import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface VersionAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly action: string;
}

/**
 * Applies IAM authorization to a Lambda version or alias request.
 *
 * AWS maps each of these operations to the IAM action of the same name,
 * always against the ARN of the function the version or alias belongs to. The
 * action varies but nothing else does, so one authorizer serves all seven
 * rather than a near-identical class per command.
 */
export class VersionAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly action: string;

  constructor(properties: VersionAuthorizerProperties) {
    this.iam = properties.iam;
    this.action = properties.action;
  }

  /**
   * Ensure the caller may perform this action on the function.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit
   * anonymous caller.
   */
  authorize(functionArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: this.action,
      resource: functionArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: this.action,
        resource: functionArn,
      });
    }
  }
}

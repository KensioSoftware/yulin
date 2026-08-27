import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimIamAccessDenied } from "../error/sim-iam.error.js";
import type { SimIamInterServiceAuthZ } from "./sim-iam-inter-service-auth-z.js";

interface SimIamActionAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a simulated service command for one action and
 * resource.
 *
 * This shared authorizer suits services whose commands map one-to-one onto an
 * IAM action and resource ARN, such as the IAM and CloudFormation control
 * planes. Commands needing richer context, such as condition values, use
 * their own per-command authorizers instead.
 */
export class SimIamActionAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimIamActionAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may perform an action on a resource.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit
   * anonymous caller, which has no identity policy permissions.
   */
  authorize(action: string, resource: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({ action, resource, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action,
        resource,
      });
    }
  }
}

import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import { SimIamAccessDenied } from "../error/sim-iam.error.js";
import type { SimIamConditionValue } from "../policy/sim-iam-policy.js";
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
 * planes. A command carrying a condition value of its own passes it here.
 * Commands needing more than that, such as a service that hands a Role over,
 * use their own per-command authorizers instead.
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
   *
   * Condition values the request itself carries are supplied last, since most
   * commands carry none and read better without an empty record.
   */
  authorize(
    action: string,
    resource: string,
    caller?: SimAwsCaller,
    conditionContext?: Readonly<Record<string, SimIamConditionValue>>,
  ): void {
    const decision = this.iam.authorize({
      action,
      resource,
      caller,
      conditionContext,
    });

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

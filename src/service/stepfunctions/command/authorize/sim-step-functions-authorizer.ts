import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simStateMachineArn } from "../../machine/sim-state-machine-arn.js";

interface SimStepFunctionsAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to Step Functions requests.
 *
 * A state machine is named by its ARN, and that is the form a Step Functions
 * policy is written in. `CreateStateMachine` has no ARN to be given. It
 * authorizes against the one the state machine is about to have, which a
 * policy naming `stateMachine:orders-*` covers.
 */
export class SimStepFunctionsAuthorizer {
  readonly #iam: SimIamInterServiceAuthZ;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimStepFunctionsAuthorizerProperties) {
    this.#iam = properties.iam;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on a state machine of this name.
   */
  authorizeStateMachineName(
    action: string,
    name: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeStateMachineArn(
      action,
      simStateMachineArn(this.#accountRegionScope, name),
      caller,
    );
  }

  /**
   * Ensure the caller may perform an action on a state machine ARN.
   *
   * The state machine need not be there. Real IAM evaluates a request before
   * the service handles it, so a caller with no permission is refused whether
   * or not the ARN names anything.
   */
  authorizeStateMachineArn(
    action: string,
    stateMachineArn: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    const decision = this.#iam.authorize({
      action,
      resource: stateMachineArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action,
        resource: stateMachineArn,
      });
    }

    return decision.caller;
  }
}

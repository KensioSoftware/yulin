import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import {
  SimIamPassRoleAuthorizer,
  simIamPassRoleDenialMessage,
} from "../../../iam/authorize/pass-role/sim-iam-pass-role-authorizer.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamCallerIdentifier } from "../../../iam/error/sim-iam-caller-identifier.js";
import { simEventBridgeServicePrincipal } from "../../delivery/sim-event-bridge-delivery.js";
import { SimEventBridgeAccessDeniedException } from "../../error/sim-event-bridge.error.js";
import type { SimEventBridgeRequestOptions } from "../sim-event-bridge-request-options.js";

/**
 * The resource an action with no resource type authorizes against.
 *
 * Real EventBridge gives ListEventBuses no resource, so IAM evaluates it
 * against `*` and only a policy whose Resource is `*` allows it. A policy
 * naming a bus ARN allows no listing, here as on AWS.
 */
const noResource = "*";

interface SimEventBridgeAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies simulated IAM authorization to EventBridge requests.
 *
 * The resource an operation authorizes against is the event bus ARN,
 * `arn:aws:events:<region>:<account>:event-bus/<name>`, which carries a
 * resource type unlike an SNS topic ARN. A policy written without the
 * `event-bus/` in it matches nothing here, as it matches nothing on real AWS.
 *
 * A denial is reported as AccessDeniedException, which is what EventBridge
 * answers a refused request with. It has no error of its own for the case, so
 * there is nothing service-specific to translate to.
 *
 * A target carrying a `RoleArn` hands EventBridge a Role it runs the target
 * as later, and that is authorized as `iam:PassRole` against the Role. An ECS
 * target is the only one this simulation reads a `RoleArn` from, since a
 * `RoleArn` on any other target is refused.
 *
 * Event bus resource policies are not part of the decision yet, because
 * nothing sets one: PutPermission and the bus `Policy` attribute are not
 * simulated. A caller from another Account therefore has no way to be admitted
 * to a bus, which is stricter than real AWS and is recorded as a limitation.
 */
export class SimEventBridgeAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly callerIdentifier = new SimIamCallerIdentifier();
  private readonly passRole: SimIamPassRoleAuthorizer;

  constructor(properties: SimEventBridgeAuthorizerProperties) {
    this.iam = properties.iam;
    this.passRole = new SimIamPassRoleAuthorizer({
      iam: properties.iam,
      passedToService: simEventBridgeServicePrincipal,
      denied: (denial): Error =>
        new SimEventBridgeAccessDeniedException(
          simIamPassRoleDenialMessage(denial),
        ),
    });
  }

  /**
   * Ensure the caller may hand EventBridge every Role a request names.
   *
   * A target with no Role of its own passes nothing.
   */
  authorizePassRole(
    roleArns: readonly (string | undefined)[],
    options?: SimEventBridgeRequestOptions,
  ): void {
    this.passRole.authorizeAll(roleArns, options?.caller);
  }

  /**
   * Ensure the caller may perform an action on a bus, named by its ARN.
   *
   * The bus need not exist. CreateEventBus authorizes against the ARN the bus
   * is about to have, and PutEvents authorizes against the ARN of a bus that
   * may well not be there.
   */
  authorizeBus(
    action: string,
    busArn: string,
    options?: SimEventBridgeRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, busArn, options);
  }

  /**
   * Ensure the caller may perform an action that names no particular bus.
   */
  authorizeAnyBus(
    action: string,
    options?: SimEventBridgeRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, noResource, options);
  }

  private authorizeResource(
    action: string,
    resource: string,
    options: SimEventBridgeRequestOptions | undefined,
  ): SimAwsResolvedCaller {
    const decision = this.iam.authorize({
      action,
      resource,
      caller: options?.caller,
    });

    if (decision.isDenied) {
      const identifier = this.callerIdentifier.format(
        decision.caller.principal,
      );

      throw new SimEventBridgeAccessDeniedException(
        `User: ${identifier} is not authorized to perform: ${action} on ` +
          `resource: ${resource}`,
      );
    }

    return decision.caller;
  }
}

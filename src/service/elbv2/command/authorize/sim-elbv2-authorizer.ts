import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamCallerIdentifier } from "../../../iam/error/sim-iam-caller-identifier.js";
import { SimElbV2AccessDeniedException } from "../../error/sim-elbv2.error.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";

/**
 * The resource an action naming no particular resource authorizes against.
 *
 * `CreateLoadBalancer` and the describes name nothing that exists yet, so IAM
 * evaluates them against `*` and only a policy whose Resource is `*` allows
 * them.
 */
const noResource = "*";

interface SimElbV2AuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies simulated IAM authorization to ELBv2 requests.
 *
 * ELBv2 has one action prefix for all four resources, and the resource an
 * action names is the ARN of whichever of them it operates on, so one
 * authorizer serves the whole service rather than one per command.
 */
export class SimElbV2Authorizer {
  private static readonly actionPrefix = "elasticloadbalancing:";

  private readonly iam: SimIamInterServiceAuthZ;
  private readonly callerIdentifier = new SimIamCallerIdentifier();

  constructor(properties: SimElbV2AuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may perform an operation on a resource, named by its
   * ARN.
   *
   * The resource need not exist yet: `CreateListener` authorizes against the
   * load balancer the listener is about to be created on.
   */
  authorize(
    operation: string,
    resourceArn: string,
    options?: SimElbV2RequestOptions,
  ): SimAwsResolvedCaller {
    return this.decide(operation, resourceArn, options);
  }

  /**
   * Ensure the caller may perform an operation naming no particular resource.
   */
  authorizeAnyResource(
    operation: string,
    options?: SimElbV2RequestOptions,
  ): SimAwsResolvedCaller {
    return this.decide(operation, noResource, options);
  }

  private decide(
    operation: string,
    resource: string,
    options: SimElbV2RequestOptions | undefined,
  ): SimAwsResolvedCaller {
    const action = `${SimElbV2Authorizer.actionPrefix}${operation}`;
    const decision = this.iam.authorize({
      action,
      resource,
      caller: options?.caller,
    });

    if (decision.isDenied) {
      const identifier = this.callerIdentifier.format(
        decision.caller.principal,
      );

      throw new SimElbV2AccessDeniedException(
        `User: ${identifier} is not authorized to perform: ${action} on ` +
          `resource: ${resource}`,
      );
    }

    return decision.caller;
  }
}

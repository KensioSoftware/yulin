import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamCallerIdentifier } from "../../../iam/error/sim-iam-caller-identifier.js";
import { SimEcsAccessDeniedException } from "../../error/sim-ecs.error.js";
import type { SimEcsRequestOptions } from "../sim-ecs-request-options.js";

/**
 * The resource an ECS action with no resource type authorizes against.
 *
 * Real ECS gives the task definition operations no resource type, because a
 * task definition is not something an ECS policy can name. The same goes for
 * `CreateCluster` and `ListClusters`. A policy allowing any of them has to use
 * a resource of `*`, and one naming a cluster ARN allows none of them, here as
 * on AWS.
 */
const noResource = "*";

interface SimEcsAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies simulated IAM authorization to ECS requests.
 *
 * ECS splits its operations two ways. `DescribeClusters` and `DeleteCluster`
 * authorize against the cluster's ARN, so a policy can name one cluster. Every
 * operation here that names a task definition, and both operations that name
 * no cluster, authorize against `*` instead.
 *
 * A denial is reported as ECS's own AccessDeniedException rather than the
 * shared IAM error, because that is the error a real ECS caller would have to
 * handle.
 */
export class SimEcsAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly callerIdentifier = new SimIamCallerIdentifier();

  constructor(properties: SimEcsAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may perform an action on a cluster, named by its ARN.
   *
   * The cluster need not exist. Authorization comes first either way, so an
   * unauthorized caller cannot learn from the error whether a cluster is
   * there.
   */
  authorizeCluster(
    action: string,
    clusterArn: string,
    options?: SimEcsRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, clusterArn, options);
  }

  /**
   * Ensure the caller may perform an action that names no ECS resource.
   */
  authorizeAnyResource(
    action: string,
    options?: SimEcsRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, noResource, options);
  }

  private authorizeResource(
    action: string,
    resource: string,
    options: SimEcsRequestOptions | undefined,
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

      throw new SimEcsAccessDeniedException(
        `User: ${identifier} is not authorized to perform: ${action} on ` +
          `resource: ${resource}`,
      );
    }

    return decision.caller;
  }
}

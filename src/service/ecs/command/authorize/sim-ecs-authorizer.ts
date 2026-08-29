import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import {
  SimIamPassRoleAuthorizer,
  simIamPassRoleDenialMessage,
} from "../../../iam/authorize/pass-role/sim-iam-pass-role-authorizer.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamCallerIdentifier } from "../../../iam/error/sim-iam-caller-identifier.js";
import { SimEcsAccessDeniedException } from "../../error/sim-ecs.error.js";
import { simEcsTasksServicePrincipal } from "../../sim-ecs-service-principal.js";
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
 * ECS splits its operations by the resource type each action takes.
 * `DescribeClusters` and `DeleteCluster` take a cluster, `RunTask` takes the
 * task definition it runs, `DescribeTasks` and `StopTask` take the task, and
 * the service operations take the service.
 * The operations that read or write a task definition, along with
 * `CreateCluster`, `ListClusters` and `ListTasks`, have no resource type at
 * all, so they authorize against `*`.
 *
 * A denial is reported as ECS's own AccessDeniedException rather than the
 * shared IAM error, because that is the error a real ECS caller would have to
 * handle.
 *
 * A registration carrying a `taskRoleArn` or an `executionRoleArn` hands ECS
 * Roles it runs the task as later, and each one is authorized as
 * `iam:PassRole` against the Role itself.
 */
export class SimEcsAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly callerIdentifier = new SimIamCallerIdentifier();
  private readonly passRole: SimIamPassRoleAuthorizer;

  constructor(properties: SimEcsAuthorizerProperties) {
    this.iam = properties.iam;
    this.passRole = new SimIamPassRoleAuthorizer({
      iam: properties.iam,
      passedToService: simEcsTasksServicePrincipal,
      denied: (denial): Error =>
        new SimEcsAccessDeniedException(simIamPassRoleDenialMessage(denial)),
    });
  }

  /**
   * Ensure the caller may hand ECS every Role a task definition names.
   *
   * Both Roles are optional on a registration, and one left out passes
   * nothing.
   */
  authorizePassRole(
    roleArns: readonly (string | undefined)[],
    options?: SimEcsRequestOptions,
  ): void {
    this.passRole.authorizeAll(roleArns, options?.caller);
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
   * Ensure the caller may perform an action on a task, named by its ARN.
   *
   * The task need not exist, as the cluster need not for a cluster action.
   */
  authorizeTask(
    action: string,
    taskArn: string,
    options?: SimEcsRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, taskArn, options);
  }

  /**
   * Ensure the caller may perform an action on a service, named by its ARN.
   *
   * The service need not exist, as the cluster need not for a cluster action.
   * `CreateService` authorizes against the ARN the service is about to have,
   * which is what real ECS does with it.
   */
  authorizeService(
    action: string,
    serviceArn: string,
    options?: SimEcsRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, serviceArn, options);
  }

  /**
   * Ensure the caller may perform an action on a task definition revision.
   *
   * `RunTask` is the one operation here whose resource is a task definition.
   * The revision it authorizes against is the one the request resolved to, so
   * a request naming a family alone is authorized against the revision it
   * would run.
   */
  authorizeTaskDefinition(
    action: string,
    taskDefinitionArn: string,
    options?: SimEcsRequestOptions,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, taskDefinitionArn, options);
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

import { randomUUID } from "node:crypto";
import type { SimArn } from "../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { parseSimEcsArn } from "../sim-ecs-arn.js";

/**
 * What a request named when it named a task.
 *
 * A task ARN carries the cluster the task runs in, so an ARN says which
 * cluster it belongs to while a bare id says nothing about one.
 */
export interface SimEcsNamedTask {
  readonly taskId: string;
  readonly clusterName: string | undefined;
}

/**
 * Builds and reads simulated ECS task ARNs for one Account and Region.
 *
 * A task is named either by its id or by its full ARN, as it is on real ECS,
 * and the two are interchangeable wherever a request names one. An ARN
 * belonging to another Account or Region names no task here, because it names
 * a task somewhere else on real AWS.
 */
export class SimEcsTaskArn {
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(accountRegionScope: SimAwsAccountRegionScope) {
    this.accountRegionScope = accountRegionScope;
  }

  /**
   * A new task id, in the 32 hexadecimal characters real ECS uses.
   */
  static newTaskId(): string {
    return randomUUID().replaceAll("-", "");
  }

  /**
   * A new container id, in the UUID form real ECS gives a container.
   */
  static newContainerId(): string {
    return randomUUID();
  }

  /**
   * Read the `cluster/id` an ECS task ARN carries.
   *
   * The older ARN format left the cluster out, so a resource part with no
   * separator is the task id on its own.
   */
  private static splitResourceId(resourceId: string): SimEcsNamedTask {
    const separatorIndex = resourceId.indexOf("/");

    if (separatorIndex === -1) {
      return { taskId: resourceId, clusterName: undefined };
    }

    return {
      clusterName: resourceId.slice(0, separatorIndex),
      taskId: resourceId.slice(separatorIndex + 1),
    };
  }

  /**
   * The ARN a task of this id has in a cluster in this Account and Region.
   */
  make(clusterName: string, taskId: string): SimArn {
    const { regionName, accountId } = this.accountRegionScope;

    return `arn:aws:ecs:${regionName}:${accountId}:task/${clusterName}/${taskId}`;
  }

  /**
   * The ARN one container of a running task has.
   *
   * Real ECS gives each container of a task an ARN of its own, under the task
   * it belongs to, so something reporting a container has one identifier that
   * names it rather than only a name that is unique within its task.
   */
  makeContainer(
    clusterName: string,
    taskId: string,
    containerId: string,
  ): SimArn {
    const { regionName, accountId } = this.accountRegionScope;
    const resource = `${clusterName}/${taskId}/${containerId}`;

    return `arn:aws:ecs:${regionName}:${accountId}:container/${resource}`;
  }

  /**
   * Read the task an identifier names, whether it is an id or a full ARN.
   *
   * Undefined covers every way an identifier names no task in this scope: it
   * is not an ARN of the right shape, it is an ARN of something else, or it is
   * an ECS task ARN belonging to another Account or Region. Callers report
   * that in their own terms, since `DescribeTasks` reports a task it cannot
   * find as a failure while `StopTask` raises.
   */
  namedTask(identifier: string): SimEcsNamedTask | undefined {
    if (!identifier.startsWith("arn:")) {
      return { taskId: identifier, clusterName: undefined };
    }

    const arn = parseSimEcsArn(identifier);
    const { regionName, accountId } = this.accountRegionScope;

    if (
      arn?.resourceType !== "task" ||
      arn.region !== regionName ||
      arn.accountId !== accountId
    ) {
      return undefined;
    }

    return SimEcsTaskArn.splitResourceId(arn.resourceId);
  }
}

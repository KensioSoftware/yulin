import type { SimArn } from "../../aws/arn.js";
import type { SimEcsTaskDetail } from "./sim-ecs-task-detail.js";

/**
 * What a task is, as opposed to where it has got to.
 */
export interface SimEcsTaskIdentityProperties {
  readonly taskId: string;
  readonly taskArn: SimArn;
  readonly clusterArn: SimArn;
  readonly clusterName: string;
  readonly taskDefinitionArn: SimArn;
  readonly family: string;
  readonly group: string;
  readonly createdAt: Date;
  readonly launchType?: string | undefined;
  readonly startedBy?: string | undefined;
  /**
   * The service keeping this task running, where one is.
   *
   * It is not something a described task reports, since real ECS says which
   * service a task belongs to through its `group` and `startedBy`. It is here
   * because `ListTasks` filters on a service name, and matching on the shape of
   * a group string would be reading a label rather than knowing the answer.
   */
  readonly serviceName?: string | undefined;
}

/**
 * The part of a described task that never changes.
 */
type SimEcsTaskIdentityDetail = Omit<
  SimEcsTaskDetail,
  | "containers"
  | "lastStatus"
  | "desiredStatus"
  | "startedAt"
  | "stoppedAt"
  | "stopCode"
  | "stoppedReason"
>;

/**
 * What one simulated ECS task is.
 *
 * A task is named by the cluster it runs in and the definition it was started
 * from, and none of that changes once it exists. Keeping it apart from the
 * lifecycle is what leaves the task itself with only the two.
 */
export class SimEcsTaskIdentity {
  public readonly taskId: string;
  public readonly taskArn: SimArn;
  public readonly clusterName: string;
  public readonly family: string;
  public readonly launchType: string | undefined;
  public readonly startedBy: string | undefined;
  public readonly serviceName: string | undefined;

  private readonly declared: SimEcsTaskIdentityProperties;

  constructor(declared: SimEcsTaskIdentityProperties) {
    this.declared = declared;
    this.taskId = declared.taskId;
    this.taskArn = declared.taskArn;
    this.clusterName = declared.clusterName;
    this.family = declared.family;
    this.launchType = declared.launchType;
    this.startedBy = declared.startedBy;
    this.serviceName = declared.serviceName;
  }

  /**
   * This part of the task as `DescribeTasks` reports it.
   */
  toOutput(): SimEcsTaskIdentityDetail {
    const { taskArn, clusterArn, taskDefinitionArn, group, createdAt } =
      this.declared;

    return {
      taskArn,
      clusterArn,
      taskDefinitionArn,
      group,
      createdAt,
      ...(this.launchType !== undefined && { launchType: this.launchType }),
      ...(this.startedBy !== undefined && { startedBy: this.startedBy }),
    };
  }
}

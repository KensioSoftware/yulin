import type { SimArn } from "../../aws/arn.js";
import type { SimEcsTaskContainerDetail } from "./sim-ecs-task-container.js";

/**
 * The states a simulated ECS task passes through.
 *
 * Real ECS has more of them, covering capacity being found and network
 * interfaces being attached. There is neither here, so a task provisions,
 * runs and stops.
 */
export type SimEcsTaskStatus = "PROVISIONING" | "RUNNING" | "STOPPED";

/**
 * The state a task is being kept in, which is what listings filter on.
 */
export type SimEcsTaskDesiredStatus = "RUNNING" | "STOPPED";

/**
 * Why a task stopped, in real ECS's own terms.
 */
export type SimEcsTaskStopCode =
  | "TaskFailedToStart"
  | "EssentialContainerExited"
  | "UserInitiated";

/**
 * Minimal structural sim ECS described task.
 *
 * https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_Task.html
 */
export interface SimEcsTaskDetail {
  readonly taskArn?: SimArn | undefined;
  readonly clusterArn?: SimArn | undefined;
  readonly taskDefinitionArn?: SimArn | undefined;
  readonly containers?: readonly SimEcsTaskContainerDetail[] | undefined;
  readonly lastStatus?: SimEcsTaskStatus | undefined;
  readonly desiredStatus?: SimEcsTaskDesiredStatus | undefined;
  readonly group?: string | undefined;
  readonly launchType?: string | undefined;
  readonly startedBy?: string | undefined;
  readonly createdAt?: Date | undefined;
  readonly startedAt?: Date | undefined;
  readonly stoppedAt?: Date | undefined;
  readonly stopCode?: SimEcsTaskStopCode | undefined;
  readonly stoppedReason?: string | undefined;
}

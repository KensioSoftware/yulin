import type { SimEcsTaskStopCode } from "../sim-ecs-task-detail.js";
import type { SimEcsTask } from "../sim-ecs-task.js";

/**
 * Why a task whose containers all finished stopped.
 */
const containersExitedReason = "Essential container in task exited";

/**
 * Why a task that ran nothing at all stopped.
 */
const nothingBoundReason =
  "No container in this task definition is bound to a simulated handler, so " +
  "nothing ran.";

/**
 * How a finished run says the task stopped.
 */
export interface SimEcsTaskStopOutcome {
  readonly stopCode: SimEcsTaskStopCode;
  readonly reason: string;
}

/**
 * Why a task stopped, in the terms real ECS reports.
 *
 * A task that ran nothing did not really start, so it says so rather than
 * reporting containers exiting. That is the answer a task definition with no
 * binding gives, and it is worth being loud about: the usual cause is a binding
 * that names a container the definition does not declare.
 */
export function simEcsTaskStopOutcome(task: SimEcsTask): SimEcsTaskStopOutcome {
  if (task.containers.some((container) => container.ran)) {
    return {
      stopCode: "EssentialContainerExited",
      reason: containersExitedReason,
    };
  }

  return { stopCode: "TaskFailedToStart", reason: nothingBoundReason };
}

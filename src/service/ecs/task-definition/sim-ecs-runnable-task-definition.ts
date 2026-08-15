import { SimEcsClientException } from "../error/sim-ecs.error.js";
import type { SimEcsTaskDefinition } from "./sim-ecs-task-definition.js";

/**
 * Take a revision to start tasks from, refusing a deregistered one.
 *
 * Real ECS refuses to run a revision that has been deregistered, and it is
 * worth refusing here: a deregistered revision is one nothing is meant to start
 * from any more. `RunTask`, `CreateService` and `UpdateService` all start tasks
 * from a revision, so the rule is here rather than in each of them.
 */
export function requiredRunnableTaskDefinition(
  taskDefinition: SimEcsTaskDefinition,
): SimEcsTaskDefinition {
  if (!taskDefinition.isActive()) {
    throw new SimEcsClientException(
      `Task definition ${taskDefinition.family}:` +
        `${String(taskDefinition.revision)} is INACTIVE, so no task can be ` +
        `run from it.`,
    );
  }

  return taskDefinition;
}

import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import type { SimEcsTaskDesiredStatus } from "../../task/sim-ecs-task-detail.js";

/**
 * The desired status a `ListTasks` request filters on.
 *
 * Real ECS filters on `RUNNING` when a request says nothing, so a task that
 * has finished is not in a plain listing. Asking for the stopped ones is how
 * a test reads what a run did.
 *
 * `PENDING` is refused, which real ECS accepts. A simulated task is only ever
 * wanted running or stopped, so the answer would always be an empty listing,
 * and refusing says so rather than looking like a result.
 */
export function listTasksDesiredStatus(
  requested: string | undefined,
): SimEcsTaskDesiredStatus {
  if (requested === undefined) {
    return "RUNNING";
  }

  if (requested === "RUNNING" || requested === "STOPPED") {
    return requested;
  }

  if (requested === "PENDING") {
    throw new SimEcsInvalidParameterException(
      "ListTasks desiredStatus PENDING is not simulated: a simulated task is " +
        "wanted either RUNNING or STOPPED, so this would always list nothing.",
    );
  }

  throw new SimEcsInvalidParameterException(
    `ListTasks desiredStatus must be RUNNING or STOPPED, not ${requested}.`,
  );
}

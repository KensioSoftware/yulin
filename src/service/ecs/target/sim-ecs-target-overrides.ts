import { isRecord } from "../../../util/type-guard/record.js";
import type { SimEcsTaskOverrideType } from "../task/run/sim-ecs-task-overrides.js";

/**
 * Read a target's fixed `Input` as the overrides the task runs with.
 *
 * A target that runs a task has nowhere else to say what the container should
 * read, so its `Input` is the task's overrides rather than a payload handed to
 * anything. That is what an EventBridge rule does on real AWS, and it is what
 * the CDK writes when a target is given container overrides. Simulated
 * Scheduler reads its target the same way, so one thing is true of both.
 *
 * A target with no `Input` runs the task with no overrides. The event a rule
 * matched is deliberately not passed on in its place: a task's overrides are
 * not an event envelope, and handing one over would refuse every delivery.
 */
export function simEcsTargetOverrides(
  input: string | undefined,
  refuse: (reason: string) => Error,
): SimEcsTaskOverrideType | undefined {
  if (input === undefined || input === "") {
    return undefined;
  }

  const document: unknown = parsed(input, refuse);

  if (!isRecord(document)) {
    throw refuse(
      "Target Input names the overrides an ECS task runs with, so it is a " +
        "JSON object with taskRoleArn or containerOverrides on it",
    );
  }

  return document;
}

/**
 * Read the `Input` text as JSON, saying so where it is not.
 */
function parsed(input: string, refuse: (reason: string) => Error): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw refuse(
      "Target Input names the overrides an ECS task runs with, and this one " +
        "is not JSON",
    );
  }
}

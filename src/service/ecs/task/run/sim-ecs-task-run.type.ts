import type { SimEcsTaskDefinition } from "../../task-definition/sim-ecs-task-definition.js";
import type { SimEcsTask } from "../sim-ecs-task.js";
import type { SimEcsTaskOverrides } from "./sim-ecs-task-overrides.js";

/**
 * One run of one simulated ECS task.
 *
 * The revision is carried alongside the task rather than looked up from it,
 * because a task holds the family and revision it came from as text: the run
 * needs the containers and the Roles that revision declared, and resolving
 * them again part way through a run could find a different answer.
 */
export interface SimEcsTaskRun {
  readonly task: SimEcsTask;
  readonly taskDefinition: SimEcsTaskDefinition;
  readonly overrides: SimEcsTaskOverrides;
}

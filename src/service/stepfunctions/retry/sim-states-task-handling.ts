import type { SimStatesCatcher } from "./sim-states-catcher.js";
import type { SimStatesRetrier } from "./sim-states-retrier.js";
import type { SimStatesTaskTimeouts } from "./sim-states-task-deadline.js";

/**
 * What a `Task` state says about failing and about running long.
 *
 * The four fields sit together because they are read together: a task that
 * fails is retried, then caught, and a task still going at its deadline fails
 * whatever it was doing.
 */
export interface SimStatesTaskHandling extends SimStatesTaskTimeouts {
  readonly Retry?: readonly SimStatesRetrier[];
  readonly Catch?: readonly SimStatesCatcher[];
}

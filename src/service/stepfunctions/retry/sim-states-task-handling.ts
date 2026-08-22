import type { SimStatesErrorHandling } from "./sim-states-error-handling.js";
import type { SimStatesTaskTimeouts } from "./sim-states-task-deadline.js";

/**
 * What a `Task` state says about failing and about running long.
 *
 * The four fields sit together because they are read together: a task that
 * fails is retried, then caught, and a task still going at its deadline fails
 * whatever it was doing.
 */
export type SimStatesTaskHandling = SimStatesErrorHandling &
  SimStatesTaskTimeouts;

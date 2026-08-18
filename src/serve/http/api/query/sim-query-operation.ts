import type { SimQueryFields } from "./sim-query-request.js";
import type { SimQueryOutput } from "./sim-query-result.js";

/**
 * One operation a Query service serves. It knows how to read its input off the
 * wire, and how to write the members its output answers with.
 *
 * A Query `Action` and an SDK Command are the same name. One key serves both,
 * naming the action a request states and the Command the simulation is asked
 * for.
 */
export interface SimQueryOperation {
  readonly input: (fields: SimQueryFields) => Record<string, unknown>;
  readonly result: (output: SimQueryOutput) => string;
}

/**
 * The operations one Query service serves, keyed by the `Action` naming each.
 */
export type SimQueryOperations = ReadonlyMap<string, SimQueryOperation>;

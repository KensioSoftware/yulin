import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesUnsimulatedInput } from "../error/sim-step-functions.error.js";

/**
 * The fields of a `Task` state this simulator has no implementation for.
 */
export const simStatesTaskFieldsUnsimulated = [
  "Retry",
  "Catch",
  "TimeoutSeconds",
  "TimeoutSecondsPath",
  "HeartbeatSeconds",
  "HeartbeatSecondsPath",
  "Credentials",
] as const;

/**
 * Refuse the fields of a `Task` state this simulator does not run.
 *
 * A definition carrying one of them would behave differently here than it does
 * on AWS. A task that failed would end the execution rather than being retried,
 * and a task that ran long would answer rather than time out.
 */
export function checkSimStatesTaskFields(
  stateName: string,
  state: Record<string, JSONValue>,
): void {
  const present = simStatesTaskFieldsUnsimulated.filter((field) =>
    Object.hasOwn(state, field),
  );

  if (present.length > 0) {
    throw new SimStatesUnsimulatedInput(
      `The Task state ${stateName} carries ${present.join(", ")}, which this ` +
        "simulator does not run yet. A task that fails ends the execution, " +
        "and a task that runs long runs to whatever its handler answers.",
    );
  }
}

import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesUnsimulatedInput } from "../error/sim-step-functions.error.js";
import { checkSimStatesTaskTimeouts } from "../retry/sim-states-task-deadline.js";

/**
 * The fields of a `Task` state this simulator has no implementation for.
 */
export const simStatesTaskFieldsUnsimulated = [
  "TimeoutSecondsPath",
  "HeartbeatSecondsPath",
  "Credentials",
] as const;

/**
 * Check the fields of a `Task` state that are not about what it invokes.
 *
 * The two fields that read a timeout out of the input are refused. A definition
 * carrying one of them would behave differently here than it does on AWS: the
 * task would run to whatever its handler answered rather than giving up when
 * the input said to.
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
        "simulator does not run yet. TimeoutSeconds and HeartbeatSeconds " +
        "say the same thing in the definition rather than in the input.",
    );
  }

  checkSimStatesTaskTimeouts(stateName, state);
}

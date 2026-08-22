import type { JSONValue } from "../../../util/type-guard/json.js";
import { parseSimStatesReferencePath } from "../data/sim-states-reference-path.js";
import { readSimStatesTimestamp } from "../data/sim-states-timestamp.js";
import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";

/**
 * The four ways a `Wait` state says how long to wait.
 */
export const simStatesWaitFields = [
  "Seconds",
  "SecondsPath",
  "Timestamp",
  "TimestampPath",
] as const;

/**
 * Check what a `Wait` state waits for.
 *
 * A `Wait` state carries exactly one of the four fields. Real Step Functions
 * refuses a definition carrying none or more than one when the state machine
 * is created, and so does this.
 */
export function checkSimStatesWaitFields(
  stateName: string,
  state: Record<string, JSONValue>,
): void {
  const present = simStatesWaitFields.filter((field) =>
    Object.hasOwn(state, field),
  );
  const [field] = present;

  if (field === undefined) {
    throw new SimStatesInvalidDefinition(
      `The Wait state ${stateName} carries none of ` +
        `${simStatesWaitFields.join(", ")}. A Wait state carries exactly one.`,
    );
  }

  if (present.length > 1) {
    throw new SimStatesInvalidDefinition(
      `The Wait state ${stateName} carries ${present.join(", ")}. A Wait ` +
        "state carries exactly one of them.",
    );
  }

  // The field was found among this state's own keys.
  // oxlint-disable-next-line security/detect-object-injection
  checkField(stateName, field, state[field]);
}

/**
 * Check the one field the state carries.
 *
 * The two paths are checked as far as their syntax here. What they select is
 * only known once the state runs.
 */
function checkField(
  stateName: string,
  field: string,
  written: JSONValue | undefined,
): void {
  if (field === "Seconds") {
    checkSeconds(stateName, written);
    return;
  }

  if (field === "Timestamp") {
    checkTimestamp(stateName, written);
    return;
  }

  if (typeof written !== "string") {
    throw new SimStatesInvalidDefinition(
      `The Wait state ${stateName} has a ${field} that is not a Reference ` +
        "Path.",
    );
  }

  parseSimStatesReferencePath(written);
}

/**
 * `Seconds` is a whole number of seconds, and never a negative one.
 */
function checkSeconds(stateName: string, written: JSONValue | undefined): void {
  if (typeof written !== "number" || !Number.isSafeInteger(written)) {
    throw new SimStatesInvalidDefinition(
      `The Wait state ${stateName} has a Seconds that is not a whole number.`,
    );
  }

  if (written < 0) {
    throw new SimStatesInvalidDefinition(
      `The Wait state ${stateName} waits for ${String(written)} seconds. A ` +
        "wait does not run backwards.",
    );
  }
}

/**
 * `Timestamp` is an instant, written the way Amazon States Language writes one.
 */
function checkTimestamp(
  stateName: string,
  written: JSONValue | undefined,
): void {
  if (readSimStatesTimestamp(written) === undefined) {
    throw new SimStatesInvalidDefinition(
      `The Wait state ${stateName} has a Timestamp that is not an RFC3339 ` +
        "instant, such as 2026-07-26T09:00:00Z.",
    );
  }
}

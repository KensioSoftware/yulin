import type { JSONValue } from "../../../util/type-guard/json.js";
import { selectSimStatesPath } from "../data/sim-states-path-segment.js";
import { parseSimStatesReferencePath } from "../data/sim-states-reference-path.js";
import { readSimStatesTimestamp } from "../data/sim-states-timestamp.js";
import type { SimStatesWaitState } from "../definition/sim-states-state.js";
import { SimStatesRuntimeFailure } from "../error/sim-step-functions.error.js";
import { simStatesWaitFields } from "./sim-states-wait-fields.js";

const millisecondsInASecond = 1000;

/**
 * The instant a `Wait` state waits for.
 *
 * The two literal fields are known from the definition. The two path fields
 * are read out of the state's effective input, and a path holding the wrong
 * kind of value fails the execution the way real Step Functions does.
 */
export function simStatesWaitDue(
  state: SimStatesWaitState,
  input: JSONValue,
  now: Date,
): Date {
  if (state.Seconds !== undefined) {
    return afterSeconds(now, state.Seconds, "Seconds");
  }

  if (state.Timestamp !== undefined) {
    return atTimestamp(state.Timestamp, "Timestamp");
  }

  if (state.SecondsPath !== undefined) {
    return afterSeconds(
      now,
      valueAt(state.SecondsPath, input),
      `SecondsPath ${state.SecondsPath}`,
    );
  }

  if (state.TimestampPath !== undefined) {
    return atTimestamp(
      valueAt(state.TimestampPath, input),
      `TimestampPath ${state.TimestampPath}`,
    );
  }

  throw new SimStatesRuntimeFailure(
    `A Wait state carries none of ${simStatesWaitFields.join(", ")}, so ` +
      "nothing says how long it waits.",
  );
}

/**
 * The instant a number of seconds from now.
 */
function afterSeconds(
  now: Date,
  seconds: JSONValue | undefined,
  source: string,
): Date {
  if (
    typeof seconds !== "number" ||
    !Number.isSafeInteger(seconds) ||
    seconds < 0
  ) {
    throw new SimStatesRuntimeFailure(
      `A Wait state reads ${source}, which holds ${JSON.stringify(seconds)} ` +
        "rather than a whole number of seconds to wait.",
    );
  }

  return new Date(now.getTime() + seconds * millisecondsInASecond);
}

/**
 * The instant a timestamp names.
 */
function atTimestamp(timestamp: JSONValue | undefined, source: string): Date {
  const milliseconds = readSimStatesTimestamp(timestamp);

  if (milliseconds === undefined) {
    throw new SimStatesRuntimeFailure(
      `A Wait state reads ${source}, which holds ` +
        `${JSON.stringify(timestamp)} rather than an RFC3339 instant.`,
    );
  }

  return new Date(milliseconds);
}

/**
 * What one of the two paths selects in the state's input.
 */
function valueAt(path: string, input: JSONValue): JSONValue | undefined {
  return selectSimStatesPath(input, parseSimStatesReferencePath(path));
}

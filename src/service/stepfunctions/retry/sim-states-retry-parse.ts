import type { JSONValue } from "../../../util/type-guard/json.js";
import {
  SimStatesInvalidDefinition,
  SimStatesUnsimulatedInput,
} from "../error/sim-step-functions.error.js";
import { simStatesMaximumWaitSeconds } from "../wait/sim-states-wait-fields.js";
import {
  type SimStatesHandlerEntry,
  readSimStatesHandlers,
} from "./sim-states-error-equals.js";
import type { SimStatesRetrier } from "./sim-states-retrier.js";

/**
 * The field of a retrier this simulator has no implementation for.
 *
 * Jitter spreads retries over the interval rather than taking all of it, and a
 * simulated retry is one a test asserts a clock advance against. An interval
 * that varies is one such a test cannot be written for.
 */
const jitterField = "JitterStrategy";

/**
 * Read a state's `Retry`, refusing anything this cannot run.
 *
 * The retriers are read when the state machine is created, so a state that
 * runs is one whose intervals and attempt counts are already known to be good.
 * Answers with nothing where the state carries no `Retry`.
 */
export function parseSimStatesRetriers(
  named: string,
  state: Record<string, JSONValue>,
): readonly SimStatesRetrier[] | undefined {
  return readSimStatesHandlers(named, state, "Retry", "retrier")?.map((entry) =>
    readRetrier(named, entry),
  );
}

/**
 * Read one retrier's `ErrorEquals` and the four fields that shape its wait.
 */
function readRetrier(
  named: string,
  entry: SimStatesHandlerEntry,
): SimStatesRetrier {
  const { written } = entry;

  if (Object.hasOwn(written, jitterField)) {
    throw new SimStatesUnsimulatedInput(
      `A retrier in the ${named} carries ${jitterField}, ` +
        "which this simulator does not run. Jitter makes the wait between " +
        "attempts vary, and a test advancing a clock over that wait needs it " +
        "not to.",
    );
  }

  return {
    ErrorEquals: entry.ErrorEquals,
    ...wholeNumber(named, written, "IntervalSeconds", 1),
    ...wholeNumber(named, written, "MaxDelaySeconds", 1),
    ...wholeNumber(named, written, "MaxAttempts", 0),
    ...backoffRate(named, written),
  };
}

/**
 * Read one of the three whole-number fields, where the retrier carries it.
 */
function wholeNumber(
  named: string,
  written: Record<string, JSONValue>,
  field: "IntervalSeconds" | "MaxDelaySeconds" | "MaxAttempts",
  least: number,
): Record<string, number> {
  // The field is one of the three named above.
  // oxlint-disable-next-line security/detect-object-injection
  const value = written[field];

  if (value === undefined) {
    return {};
  }

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < least ||
    value > simStatesMaximumWaitSeconds
  ) {
    throw new SimStatesInvalidDefinition(
      `A retrier in the ${named} has a ${field} of ` +
        `${JSON.stringify(value)}. It is a whole number from ` +
        `${String(least)} to ${String(simStatesMaximumWaitSeconds)}.`,
    );
  }

  return { [field]: value };
}

/**
 * Read `BackoffRate`, which multiplies the wait for each retry already taken.
 */
function backoffRate(
  named: string,
  written: Record<string, JSONValue>,
): Record<string, number> {
  const value = written["BackoffRate"];

  if (value === undefined) {
    return {};
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    throw new SimStatesInvalidDefinition(
      `A retrier in the ${named} has a BackoffRate of ` +
        `${JSON.stringify(value)}. It is at least 1, since a wait that ` +
        "shrank would retry faster the longer a failure went on.",
    );
  }

  return { BackoffRate: value };
}

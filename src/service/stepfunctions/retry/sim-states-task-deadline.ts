import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";
import type { SimStatesFailOutcome } from "../execution/sim-states-state-outcome.js";
import { simStatesMaximumWaitSeconds } from "../wait/sim-states-wait-fields.js";
import type { SimStatesAttemptState } from "./sim-states-attempt-state.js";
import { simStatesTimeoutError } from "./sim-states-error-name.js";

const millisecondsInASecond = 1000;

/**
 * The two fields that say how long a `Task` state waits for its work.
 */
export const simStatesTaskTimeoutFields = [
  "TimeoutSeconds",
  "HeartbeatSeconds",
] as const;

/**
 * How long a `Task` state waits before it gives up.
 */
export interface SimStatesTaskTimeouts {
  readonly TimeoutSeconds?: number;
  readonly HeartbeatSeconds?: number;
}

/**
 * When a `Task` state stops waiting, and which field said so.
 */
export interface SimStatesTaskDeadline {
  readonly at: Date;
  readonly field: string;
  readonly seconds: number;
}

/**
 * The instant a `Task` state entered now gives up at.
 *
 * A state carrying both fields gives up at whichever comes first, and one
 * carrying neither waits as long as its work takes. The deadline covers the
 * state rather than one attempt at it, so the retries a task takes run against
 * the same one.
 */
export function simStatesTaskDeadline(
  timeouts: SimStatesTaskTimeouts,
  now: Date,
): SimStatesTaskDeadline | undefined {
  const soonest = [
    ...(timeouts.TimeoutSeconds === undefined
      ? []
      : [{ field: "TimeoutSeconds", seconds: timeouts.TimeoutSeconds }]),
    ...(timeouts.HeartbeatSeconds === undefined
      ? []
      : [{ field: "HeartbeatSeconds", seconds: timeouts.HeartbeatSeconds }]),
  ].toSorted((one, other) => one.seconds - other.seconds)[0];

  if (soonest === undefined) {
    return undefined;
  }

  return {
    ...soonest,
    at: new Date(now.getTime() + soonest.seconds * millisecondsInASecond),
  };
}

/**
 * The failure a task that has run past its deadline ends with.
 *
 * Answers with nothing while the clock is still inside it, which is every
 * attempt at a state carrying neither timeout field.
 */
export function simStatesTimedOut(
  stateName: string,
  attempt: SimStatesAttemptState,
  now: Date,
): SimStatesFailOutcome | undefined {
  const { deadline } = attempt;

  if (deadline === undefined || now.getTime() < deadline.at.getTime()) {
    return undefined;
  }

  return {
    kind: "fail",
    error: simStatesTimeoutError,
    cause:
      `The Task state ${stateName} ran past the ` +
      `${String(deadline.seconds)} seconds its ${deadline.field} allows.`,
  };
}

/**
 * Check what a `Task` state's two timeout fields hold.
 */
export function checkSimStatesTaskTimeouts(
  stateName: string,
  state: Record<string, JSONValue>,
): void {
  for (const field of simStatesTaskTimeoutFields) {
    // The field is one of the two named above.
    // oxlint-disable-next-line security/detect-object-injection
    const written = state[field];

    if (written === undefined) {
      continue;
    }

    if (
      typeof written !== "number" ||
      !Number.isSafeInteger(written) ||
      written < 1 ||
      written > simStatesMaximumWaitSeconds
    ) {
      throw new SimStatesInvalidDefinition(
        `The Task state ${stateName} has a ${field} of ` +
          `${JSON.stringify(written)}. It is a whole number of seconds from ` +
          `1 to ${String(simStatesMaximumWaitSeconds)}.`,
      );
    }
  }
}

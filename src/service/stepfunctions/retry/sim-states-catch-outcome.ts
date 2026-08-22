import type { JSONValue } from "../../../util/type-guard/json.js";
import type {
  SimStatesFailOutcome,
  SimStatesNextOutcome,
} from "../execution/sim-states-state-outcome.js";
import {
  type SimStatesCatcher,
  simStatesCaughtOutput,
  simStatesErrorOutput,
} from "./sim-states-catcher.js";
import { simStatesErrorMatches } from "./sim-states-error-name.js";

/**
 * Where a catcher sends a failure it matches, carrying the error output.
 *
 * The catchers are tried in the order they were written and the first one
 * naming the error takes it. A failure none of them names is left as it was.
 */
export function simStatesCatchOutcome(
  catchers: readonly SimStatesCatcher[],
  failure: SimStatesFailOutcome,
  input: JSONValue,
): SimStatesNextOutcome | undefined {
  const catcher = catchers.find((entry) =>
    simStatesErrorMatches(entry.ErrorEquals, failure.error),
  );

  if (catcher === undefined) {
    return undefined;
  }

  return {
    kind: "next",
    next: catcher.Next,
    output: simStatesCaughtOutput(
      catcher,
      input,
      simStatesErrorOutput(failure.error, failure.cause),
    ),
  };
}

import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import { parseSimStatesReferencePath } from "../data/sim-states-reference-path.js";
import { insertAtSimStatesPath } from "../data/sim-states-result-path.js";

/**
 * One entry in a state's `Catch`.
 *
 * `Next` is where a caught failure sends the execution, and `ResultPath` says
 * where in the state's input the error goes. A catcher left without one
 * replaces the input with the error, which is what a `ResultPath` of `$` does.
 */
export interface SimStatesCatcher {
  readonly ErrorEquals: readonly string[];
  readonly Next: string;
  readonly ResultPath?: string | null;
}

/**
 * What a caught failure looks like to the state it is sent to.
 *
 * Amazon States Language calls this the error output, and it holds the error
 * name and whatever the failure said about itself.
 */
export function simStatesErrorOutput(
  error: string,
  cause: string | undefined,
): JSONObject {
  return {
    Error: error,
    ...(cause !== undefined && { Cause: cause }),
  };
}

/**
 * The input the state a catcher names is given.
 *
 * `ResultPath` reads the raw input of the state that failed, so a catcher can
 * put the error beside the data the task was working on. A `ResultPath` of
 * `null` discards the error and passes the input on as it was.
 */
export function simStatesCaughtOutput(
  catcher: SimStatesCatcher,
  input: JSONValue,
  error: JSONObject,
): JSONValue {
  if (catcher.ResultPath === null) {
    return input;
  }

  if (catcher.ResultPath === undefined) {
    return error;
  }

  return insertAtSimStatesPath(
    input,
    parseSimStatesReferencePath(catcher.ResultPath),
    error,
    catcher.ResultPath,
  );
}

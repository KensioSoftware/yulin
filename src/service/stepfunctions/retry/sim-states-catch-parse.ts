import type { JSONValue } from "../../../util/type-guard/json.js";
import { parseSimStatesReferencePath } from "../data/sim-states-reference-path.js";
import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";
import type { SimStatesCatcher } from "./sim-states-catcher.js";
import {
  type SimStatesHandlerEntry,
  readSimStatesHandlers,
} from "./sim-states-error-equals.js";

/**
 * Read a state's `Catch`, refusing anything this cannot run.
 *
 * A catcher's `Next` is checked against the state machine's own states once
 * every state has been read, alongside the other transitions. Answers with
 * nothing where the state carries no `Catch`.
 */
export function parseSimStatesCatchers(
  named: string,
  state: Record<string, JSONValue>,
): readonly SimStatesCatcher[] | undefined {
  return readSimStatesHandlers(named, state, "Catch", "catcher")?.map((entry) =>
    readCatcher(named, entry),
  );
}

/**
 * Read one catcher, which names where a failure it matches goes.
 */
function readCatcher(
  named: string,
  entry: SimStatesHandlerEntry,
): SimStatesCatcher {
  const next = entry.written["Next"];

  if (typeof next !== "string") {
    throw new SimStatesInvalidDefinition(
      `A catcher in the ${named} has no Next naming the ` +
        "state a caught failure goes to.",
    );
  }

  return {
    ErrorEquals: entry.ErrorEquals,
    Next: next,
    ...resultPath(named, entry.written["ResultPath"]),
  };
}

/**
 * Read a catcher's `ResultPath`, which is where the error lands.
 *
 * The path is checked as far as its syntax here. Whether the input it is
 * written into can hold it is only known once a failure is caught.
 */
function resultPath(
  named: string,
  written: JSONValue | undefined,
): { ResultPath?: string | null } {
  if (written === undefined) {
    return {};
  }

  if (written === null) {
    return { ResultPath: null };
  }

  if (typeof written !== "string") {
    throw new SimStatesInvalidDefinition(
      `A catcher in the ${named} has a ResultPath that is ` +
        "neither a Reference Path nor null.",
    );
  }

  parseSimStatesReferencePath(written);

  return { ResultPath: written };
}

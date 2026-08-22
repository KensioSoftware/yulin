import type { JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import { SimStatesInvalidDefinition } from "../error/sim-step-functions.error.js";
import { simStatesAllErrors } from "./sim-states-error-name.js";

/**
 * One entry of a `Retry` or a `Catch`, as it was written.
 */
export interface SimStatesHandlerEntry {
  readonly ErrorEquals: readonly string[];
  readonly written: Record<string, JSONValue>;
}

/**
 * Read the entries of a state's `Retry` or `Catch`.
 *
 * Both fields are an ordered array of entries, and both say what they handle
 * the same way. What each entry then does with a match is what tells them
 * apart, so that is read by the caller.
 *
 * Answers with nothing where the state carries neither field.
 */
export function readSimStatesHandlers(
  named: string,
  state: Record<string, JSONValue>,
  field: "Retry" | "Catch",
  noun: string,
): readonly SimStatesHandlerEntry[] | undefined {
  // The field is one of the two this reads.
  // oxlint-disable-next-line security/detect-object-injection
  const declared = state[field];

  if (declared === undefined) {
    return undefined;
  }

  if (!Array.isArray(declared)) {
    throw new SimStatesInvalidDefinition(
      `The ${field} of the ${named} is not an array of ${noun}s.`,
    );
  }

  const entries = declared.map((entry) => readEntry(named, field, noun, entry));

  checkAllErrorsLast(named, field, noun, entries);

  return entries;
}

/**
 * Read one entry, whose `ErrorEquals` says what it handles.
 */
function readEntry(
  named: string,
  field: string,
  noun: string,
  entry: JSONValue,
): SimStatesHandlerEntry {
  if (!isRecord(entry)) {
    throw new SimStatesInvalidDefinition(
      `A ${noun} in the ${field} of the ${named} is not an object.`,
    );
  }

  const declared = entry["ErrorEquals"];
  const errors = Array.isArray(declared)
    ? declared.filter((error) => typeof error === "string")
    : [];

  if (
    !Array.isArray(declared) ||
    errors.length !== declared.length ||
    errors.length === 0
  ) {
    throw new SimStatesInvalidDefinition(
      `A ${noun} in the ${field} of the ${named} has no ` +
        "ErrorEquals naming the errors it handles.",
    );
  }

  checkAllErrorsAlone(named, field, noun, errors);

  return { ErrorEquals: errors, written: entry };
}

/**
 * `States.ALL` matches anything, so it names nothing alongside it.
 */
function checkAllErrorsAlone(
  named: string,
  field: string,
  noun: string,
  errors: readonly string[],
): void {
  if (errors.includes(simStatesAllErrors) && errors.length > 1) {
    throw new SimStatesInvalidDefinition(
      `A ${noun} in the ${field} of the ${named} names ` +
        `${simStatesAllErrors} alongside ${errors.filter((error) => error !== simStatesAllErrors).join(", ")}. ` +
        `${simStatesAllErrors} matches anything, so it stands on its own.`,
    );
  }
}

/**
 * `States.ALL` comes last, since nothing written after it could ever match.
 */
function checkAllErrorsLast(
  named: string,
  field: string,
  noun: string,
  entries: readonly SimStatesHandlerEntry[],
): void {
  const at = entries.findIndex((entry) =>
    entry.ErrorEquals.includes(simStatesAllErrors),
  );

  if (at !== -1 && at < entries.length - 1) {
    throw new SimStatesInvalidDefinition(
      `The ${field} of the ${named} names ` +
        `${simStatesAllErrors} in a ${noun} that is not the last one. ` +
        `${simStatesAllErrors} matches anything, so nothing after it could ` +
        "ever be reached.",
    );
  }
}

// oxlint-disable security/detect-object-injection -- keys come from a parsed
// Reference Path, and the document being written is JSON the execution owns.
import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import { SimStatesResultPathMatchFailure } from "../error/sim-step-functions.error.js";
import type { SimStatesPathSegment } from "./sim-states-path-segment.js";

/**
 * Put a state's result into its raw input at a Reference Path.
 *
 * The document is copied down the path being written, so the value handed in
 * is left as it was. Everything off the path is shared, since nothing in an
 * execution mutates a value it has already produced.
 */
export function insertAtSimStatesPath(
  document: JSONValue,
  segments: readonly SimStatesPathSegment[],
  result: JSONValue,
  resultPath: string,
): JSONValue {
  const [segment, ...rest] = segments;

  if (segment === undefined) {
    return result;
  }

  if (segment.kind === "index") {
    return insertIntoArray(document, segment.index, rest, result, resultPath);
  }

  return insertIntoObject(document, segment.name, rest, result, resultPath);
}

/**
 * Write one field, building the object where the document holds nothing yet.
 */
function insertIntoObject(
  document: JSONValue,
  name: string,
  rest: readonly SimStatesPathSegment[],
  result: JSONValue,
  resultPath: string,
): JSONValue {
  const target = document ?? {};

  if (!isRecord(target)) {
    throw new SimStatesResultPathMatchFailure(
      `${resultPath} writes the field ${name} into a value that is not an ` +
        "object, so the result has nowhere to go.",
    );
  }

  const copy: JSONObject = { ...target };

  copy[name] = insertAtSimStatesPath(
    copy[name] ?? null,
    rest,
    result,
    resultPath,
  );

  return copy;
}

/**
 * Write one array element.
 */
function insertIntoArray(
  document: JSONValue,
  index: number,
  rest: readonly SimStatesPathSegment[],
  result: JSONValue,
  resultPath: string,
): JSONValue {
  if (!Array.isArray(document)) {
    throw new SimStatesResultPathMatchFailure(
      `${resultPath} writes element ${String(index)} into a value that is ` +
        "not an array, so the result has nowhere to go.",
    );
  }

  const copy = [...document];

  copy[index] = insertAtSimStatesPath(
    copy[index] ?? null,
    rest,
    result,
    resultPath,
  );

  return copy;
}

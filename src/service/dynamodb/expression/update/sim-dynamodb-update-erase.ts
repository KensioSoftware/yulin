import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbDocumentPathSegment } from "../sim-dynamodb-document-path.js";

/**
 * A value with whatever the steps below it point at taken away, or nothing when
 * the value itself is what was pointed at.
 */
export function simDynamoDbValueWithout(
  value: SimDynamoDbValue | undefined,
  segments: readonly SimDynamoDbDocumentPathSegment[],
): SimDynamoDbValue | undefined {
  const step = segments.at(0);

  if (step === undefined) {
    return undefined;
  }

  const rest = segments.slice(1);

  if (step.kind === "attribute") {
    return mapWithout(value, step.name, rest);
  }

  return listWithout(value, step.index, rest);
}

/**
 * A map with whatever one of its attributes leads to taken away.
 */
function mapWithout(
  value: SimDynamoDbValue | undefined,
  name: string,
  rest: readonly SimDynamoDbDocumentPathSegment[],
): SimDynamoDbValue | undefined {
  // Anything that is not a map holds no attribute to remove, so it is left as
  // it is. Nothing there at all comes back as nothing, which the caller reads
  // as an attribute that was already gone.
  if (value?.kind !== "M") {
    return value;
  }

  const kept = simDynamoDbValueWithout(value.entries.get(name), rest);
  const entries = new Map(value.entries);

  if (kept === undefined) {
    entries.delete(name);
  } else {
    entries.set(name, kept);
  }

  return { kind: "M", entries };
}

/**
 * A list with whatever one of its elements leads to taken away.
 *
 * Removing an element closes the list up, so the elements after it move down.
 * An index past the end points at nothing, so there is nothing to remove.
 */
function listWithout(
  value: SimDynamoDbValue | undefined,
  index: number,
  rest: readonly SimDynamoDbDocumentPathSegment[],
): SimDynamoDbValue | undefined {
  if (value?.kind !== "L") {
    return value;
  }

  const kept = simDynamoDbValueWithout(value.values.at(index), rest);
  const values = [...value.values];

  if (kept === undefined) {
    values.splice(index, 1);
  } else {
    // A whole number read out of the expression, written into an array made
    // here.
    // oxlint-disable-next-line security/detect-object-injection
    values[index] = kept;
  }

  return { kind: "L", values };
}

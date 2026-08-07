import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbDocumentPathSegment } from "../sim-dynamodb-document-path.js";
import type { SimDynamoDbUpdateTarget } from "./sim-dynamodb-update-target.js";

/**
 * A value with something written into it, at the steps below it.
 *
 * With no steps left, the value itself is what was written. Otherwise the value
 * has to be the kind of thing that step reaches into, since an update cannot
 * make one on the way past: real DynamoDB refuses `SET address.city = :c` where
 * the item has no `address`.
 */
export function simDynamoDbValueWith(
  value: SimDynamoDbValue | undefined,
  segments: readonly SimDynamoDbDocumentPathSegment[],
  written: SimDynamoDbValue,
  target: SimDynamoDbUpdateTarget,
): SimDynamoDbValue {
  const step = segments.at(0);

  if (step === undefined) {
    return written;
  }

  const rest = segments.slice(1);

  if (step.kind === "attribute") {
    return mapWith(value, step.name, rest, written, target);
  }

  return listWith(value, step.index, rest, written, target);
}

/**
 * A map with something written into one of its attributes.
 */
function mapWith(
  value: SimDynamoDbValue | undefined,
  name: string,
  rest: readonly SimDynamoDbDocumentPathSegment[],
  written: SimDynamoDbValue,
  target: SimDynamoDbUpdateTarget,
): SimDynamoDbValue {
  if (value?.kind !== "M") {
    throw simDynamoDbInvalidPath(target);
  }

  const entries = new Map(value.entries);
  entries.set(
    name,
    simDynamoDbValueWith(entries.get(name), rest, written, target),
  );

  return { kind: "M", entries };
}

/**
 * A list with something written into one of its elements.
 *
 * An index past the end appends, as it does on AWS: `SET lines[9] = :line` on a
 * two element list makes it the third element rather than leaving a gap.
 */
function listWith(
  value: SimDynamoDbValue | undefined,
  index: number,
  rest: readonly SimDynamoDbDocumentPathSegment[],
  written: SimDynamoDbValue,
  target: SimDynamoDbUpdateTarget,
): SimDynamoDbValue {
  if (value?.kind !== "L") {
    throw simDynamoDbInvalidPath(target);
  }

  const values = [...value.values];
  const at = Math.min(index, values.length);

  // A whole number read out of the expression, written into an array made here.
  // oxlint-disable-next-line security/detect-object-injection
  values[at] = simDynamoDbValueWith(values.at(at), rest, written, target);

  return { kind: "L", values };
}

/**
 * Refuse a path that does not lead anywhere an update can write.
 */
export function simDynamoDbInvalidPath(
  target: SimDynamoDbUpdateTarget,
): SimDynamoDbValidationException {
  return new SimDynamoDbValidationException(
    `The document path provided in the update expression is invalid for ` +
      `update: '${target.text}'`,
  );
}

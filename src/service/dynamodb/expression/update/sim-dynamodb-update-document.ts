import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type { SimDynamoDbUpdateTarget } from "./sim-dynamodb-update-target.js";

/**
 * The item an update is building.
 *
 * It starts as the item that was there, or as the Key when there was none, and
 * each action writes into it. Nothing reads from it: an action reads the
 * snapshot of the item as it stood before the update, so what one action writes
 * is not what the next one sees.
 */
export class SimDynamoDbUpdateDocument {
  private attributes: ReadonlyMap<string, SimDynamoDbValue>;

  constructor(attributes: ReadonlyMap<string, SimDynamoDbValue>) {
    this.attributes = attributes;
  }

  /**
   * Write a value where a target points.
   */
  set(target: SimDynamoDbUpdateTarget, value: SimDynamoDbValue): void {
    const written = new Map(this.attributes);

    written.set(
      target.head,
      valueWith(written.get(target.head), target.rest, value, target),
    );

    this.attributes = written;
  }

  /**
   * Take away whatever a target points at.
   *
   * A target pointing at nothing is not a failure. REMOVE names a place rather
   * than a value, so removing an attribute that is not there asks for the state
   * the item is already in.
   */
  remove(target: SimDynamoDbUpdateTarget): void {
    const written = new Map(this.attributes);
    const kept = valueWithout(written.get(target.head), target.rest);

    if (kept === undefined) {
      written.delete(target.head);
    } else {
      written.set(target.head, kept);
    }

    this.attributes = written;
  }

  /**
   * The item this update made.
   */
  toItem(): SimDynamoDbItem {
    return SimDynamoDbItem.ofUpdatedAttributes(this.attributes);
  }
}

/**
 * A value with something written into it, at the names below it.
 *
 * With no names left, the value itself is what was written. Otherwise the value
 * has to be a map, since an update cannot make one on the way past: real
 * DynamoDB refuses `SET address.city = :c` where the item has no `address`.
 */
function valueWith(
  value: SimDynamoDbValue | undefined,
  names: readonly string[],
  written: SimDynamoDbValue,
  target: SimDynamoDbUpdateTarget,
): SimDynamoDbValue {
  const head = names.at(0);

  if (head === undefined) {
    return written;
  }

  if (value?.kind !== "M") {
    throw new SimDynamoDbValidationException(
      `The document path provided in the update expression is invalid for ` +
        `update: '${target.text}' reaches into an attribute that is not a map`,
    );
  }

  const entries = new Map(value.entries);
  entries.set(
    head,
    valueWith(entries.get(head), names.slice(1), written, target),
  );

  return { kind: "M", entries };
}

/**
 * A value with whatever the names below it point at taken away, or nothing when
 * the value itself is what was pointed at.
 */
function valueWithout(
  value: SimDynamoDbValue | undefined,
  names: readonly string[],
): SimDynamoDbValue | undefined {
  const head = names.at(0);

  if (head === undefined) {
    return undefined;
  }

  if (value?.kind !== "M") {
    return value;
  }

  const kept = valueWithout(value.entries.get(head), names.slice(1));
  const entries = new Map(value.entries);

  if (kept === undefined) {
    entries.delete(head);
  } else {
    entries.set(head, kept);
  }

  return { kind: "M", entries };
}

import { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import { simDynamoDbValueWithout } from "./sim-dynamodb-update-erase.js";
import type { SimDynamoDbUpdateTarget } from "./sim-dynamodb-update-target.js";
import { simDynamoDbValueWith } from "./sim-dynamodb-update-write.js";

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
      simDynamoDbValueWith(
        written.get(target.head),
        target.rest,
        value,
        target,
      ),
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
    const kept = simDynamoDbValueWithout(written.get(target.head), target.rest);

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

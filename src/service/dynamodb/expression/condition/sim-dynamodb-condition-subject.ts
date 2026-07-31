import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbValue } from "../../item/sim-dynamodb-value.js";
import type {
  SimDynamoDbDocumentPath,
  SimDynamoDbDocumentPathSegment,
} from "../sim-dynamodb-document-path.js";

/**
 * The item a condition is evaluated against.
 *
 * A conditional write is checked against whatever is stored under its key,
 * which may be nothing at all. That is what makes
 * `attribute_not_exists(id)` the way to insert only if absent: with no item
 * there, every path resolves to nothing.
 */
export class SimDynamoDbConditionSubject {
  private readonly item: SimDynamoDbItem | undefined;

  constructor(item?: SimDynamoDbItem) {
    this.item = item;
  }

  /**
   * The value a document path points at, or nothing when the item does not
   * have it.
   *
   * A path reaching into the wrong kind of value resolves to nothing rather
   * than failing, the same way a projection passes over it: the item does not
   * have what was asked for.
   */
  valueAt(path: SimDynamoDbDocumentPath): SimDynamoDbValue | undefined {
    let value = this.asMap();

    for (const segment of path.segments) {
      if (value === undefined) {
        return undefined;
      }

      value = this.step(value, segment);
    }

    return value;
  }

  /**
   * Follow one step of a path, from whatever the step before reached.
   */
  private step(
    value: SimDynamoDbValue,
    segment: SimDynamoDbDocumentPathSegment,
  ): SimDynamoDbValue | undefined {
    if (segment.kind === "attribute" && value.kind === "M") {
      return value.entries.get(segment.name);
    }

    if (segment.kind === "index" && value.kind === "L") {
      return value.values.at(segment.index);
    }

    return undefined;
  }

  /**
   * The item as a value, so the first step of a path is taken the same way as
   * every step after it.
   *
   * An item is a map of attributes, so a path starting with a list index
   * points at nothing rather than needing a rule of its own.
   */
  private asMap(): SimDynamoDbValue | undefined {
    if (this.item === undefined) {
      return undefined;
    }

    return { kind: "M", entries: this.item.entries() };
  }
}

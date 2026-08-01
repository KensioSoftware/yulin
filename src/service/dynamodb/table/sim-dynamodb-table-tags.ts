import type { SimDynamoDbTagInput } from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import { SimDynamoDbTableTag } from "./sim-dynamodb-table-tag.js";
import { compareSimDynamoDbTextBytes } from "./sim-dynamodb-table-order.js";

/**
 * Real DynamoDB holds 50 tags on a resource.
 *
 * Tags AWS assigns itself are outside this, but a caller cannot assign one of
 * those, so every tag here counts towards it.
 */
const greatestTags = 50;

/**
 * The tags one simulated DynamoDB resource holds.
 *
 * A key appears once. Tagging a key that is already there replaces its value
 * rather than adding a second entry, which is what makes TagResource a way of
 * changing a tag as well as adding one.
 */
export class SimDynamoDbTableTags {
  private tags: ReadonlyMap<string, SimDynamoDbTableTag>;

  private constructor(tags: ReadonlyMap<string, SimDynamoDbTableTag>) {
    this.tags = tags;
  }

  /**
   * Read the tags a request carries, which may be none at all.
   */
  static fromInput(
    input: readonly SimDynamoDbTagInput[] | undefined,
  ): SimDynamoDbTableTags {
    const tags = new this(new Map());

    tags.apply(input ?? []);

    return tags;
  }

  /**
   * Add the tags a request carries, replacing the value of any key already
   * held.
   *
   * The whole request is read and counted before anything is kept, so a request
   * DynamoDB would refuse leaves the tags exactly as they were.
   */
  apply(input: readonly SimDynamoDbTagInput[]): void {
    const applied = new Map(this.tags);

    for (const entry of input) {
      const tag = SimDynamoDbTableTag.fromInput(entry);

      applied.set(tag.key, tag);
    }

    assertWithinLimit(applied.size);

    this.tags = applied;
  }

  /**
   * Take the tags a request names off, leaving the rest.
   *
   * A key that is not there is not an error. UntagResource asks for a state
   * rather than for a change, and that state is a resource without that key.
   */
  remove(keys: readonly string[]): void {
    const left = new Map(this.tags);

    for (const key of keys) {
      left.delete(key);
    }

    this.tags = left;
  }

  /**
   * Every tag this resource holds, ordered by key.
   *
   * DynamoDB says nothing about the order it lists tags in. Ordering them by
   * UTF-8 bytes, as table names are ordered, is one of the orders it allows,
   * and it is what lets a page resume at the key after the last one listed.
   */
  ordered(): readonly SimDynamoDbTableTag[] {
    return this.tags
      .values()
      .toArray()
      .toSorted((first, second) =>
        compareSimDynamoDbTextBytes(first.key, second.key),
      );
  }
}

/**
 * Refuse a resource holding more tags than DynamoDB holds.
 *
 * Real DynamoDB answers this with a ValidationException rather than the
 * LimitExceededException its API reference lists for TagResource. That error is
 * documented entirely in terms of how many table operations are running at
 * once, which is a different thing from how many tags a table is carrying.
 */
function assertWithinLimit(size: number): void {
  if (size > greatestTags) {
    throw new SimDynamoDbValidationException(
      `A DynamoDB resource holds ${greatestTags.toString()} tags, and this ` +
        `request would leave it holding ${size.toString()}`,
    );
  }
}

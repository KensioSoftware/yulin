import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbKeySchema } from "../../table/sim-dynamodb-key-schema.js";
import { simDynamoDbPrimaryKeyAttributes } from "../../table/sim-dynamodb-primary-key.js";
import type { SimDynamoDbAttributeValue } from "./item.types.js";

/**
 * Read the page size a request asks for.
 *
 * A request with no `Limit` reads everything the key range holds. Real DynamoDB
 * stops a page at 1 MB instead, which is not modelled here, so a page breaks
 * only on a `Limit`.
 */
function readLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return Infinity;
  }

  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new SimDynamoDbValidationException(
      `Limit ${limit.toString()} is invalid. It is a whole number of at ` +
        `least 1.`,
    );
  }

  return limit;
}

interface SimDynamoDbItemPageProperties {
  /** The items the walk reached, already in the order they are read in. */
  readonly items: readonly SimDynamoDbItem[];
  readonly limit: number | undefined;
  readonly keySchema: SimDynamoDbKeySchema;
}

/**
 * One page of items, as a Query hands them out.
 *
 * `Limit` counts the items a walk evaluated rather than the items it answers
 * with. A page is cut here and filtered afterwards, which is what makes
 * `ScannedCount` the items the read evaluated and lets a filtered page come
 * back shorter than the limit, or empty.
 *
 * `LastEvaluatedKey` is there whenever the walk stopped at the limit, including
 * when it stopped on the last matching item. A caller looping until the token
 * is absent therefore reads one empty page at the end. That is what real
 * DynamoDB does: it cannot know the range is exhausted without looking past it.
 *
 * Scan pages the same way, so this takes items and a key schema rather than a
 * query.
 */
export class SimDynamoDbItemPage {
  public readonly items: readonly SimDynamoDbItem[];
  public readonly lastEvaluatedKey:
    Record<string, SimDynamoDbAttributeValue> | undefined;

  constructor(properties: SimDynamoDbItemPageProperties) {
    const limit = readLimit(properties.limit);

    this.items = properties.items.slice(0, limit);
    this.lastEvaluatedKey = this.tokenFor(properties.keySchema, limit);
  }

  /**
   * The key to resume from, when the walk stopped at the limit rather than at
   * the end of the range.
   */
  private tokenFor(
    keySchema: SimDynamoDbKeySchema,
    limit: number,
  ): Record<string, SimDynamoDbAttributeValue> | undefined {
    const last = this.items.at(-1);

    if (last === undefined || this.items.length < limit) {
      return undefined;
    }

    return simDynamoDbPrimaryKeyAttributes(last, keySchema);
  }
}

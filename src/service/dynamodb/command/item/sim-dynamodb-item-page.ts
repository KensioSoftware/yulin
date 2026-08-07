import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbReadView } from "../../table/sim-dynamodb-read-view.js";
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
  readonly view: SimDynamoDbReadView;
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
 * Scan pages the same way, so this takes items and the view they came from
 * rather than a query. The view is also what decides which key attributes the
 * token carries: a read of an index names the item it stopped on by the index
 * key and the table key together, since an index key is not unique.
 */
export class SimDynamoDbItemPage {
  public readonly items: readonly SimDynamoDbItem[];
  public readonly lastEvaluatedKey:
    | Record<string, SimDynamoDbAttributeValue>
    | undefined;

  constructor(properties: SimDynamoDbItemPageProperties) {
    const limit = readLimit(properties.limit);

    this.items = properties.items.slice(0, limit);
    this.lastEvaluatedKey = this.tokenFor(properties.view, limit);
  }

  /**
   * The key to resume from, when the walk stopped at the limit rather than at
   * the end of the range.
   */
  private tokenFor(
    view: SimDynamoDbReadView,
    limit: number,
  ): Record<string, SimDynamoDbAttributeValue> | undefined {
    const last = this.items.at(-1);

    if (last === undefined || this.items.length < limit) {
      return undefined;
    }

    return view.tokenKey(last);
  }
}

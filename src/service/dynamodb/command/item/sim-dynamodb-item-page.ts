import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbReadView } from "../../table/sim-dynamodb-read-view.js";
import type { SimDynamoDbAttributeValue } from "./item.types.js";

/**
 * The most data one Query or Scan page reads, in bytes.
 *
 * DynamoDB counts this before any filter runs, so a page of items a filter
 * mostly drops still stops at 1 MB of what it read.
 */
export const simDynamoDbPageDataLimitBytes = 1024 * 1024;

/**
 * Read the page size a request asks for.
 *
 * A request with no `Limit` reads until the range runs out or the page has
 * read 1 MB, whichever comes first.
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
 * One page of items, as a Query or a Scan hands them out.
 *
 * A page ends at the `Limit` or at 1 MB of data read, whichever comes first.
 * Both count the items a walk evaluated rather than the items it answers with.
 * A page is cut here and filtered afterwards, which is what makes
 * `ScannedCount` the items the read evaluated and lets a filtered page come
 * back shorter than the limit, or empty.
 *
 * The 1 MB is counted from each item as the view holds it, so a read of an
 * index counts the attributes the index projects rather than the whole item.
 * The item that takes the total past 1 MB is the last one read, and is on the
 * page: DynamoDB stops once the data read exceeds the limit, rather than
 * before it would.
 *
 * `LastEvaluatedKey` is there whenever the walk stopped early, including when
 * it stopped on the last matching item. A caller looping until the token is
 * absent therefore reads one empty page at the end. That is what real DynamoDB
 * does: it cannot know the range is exhausted without looking past it.
 *
 * The view also decides which key attributes the token carries: a read of an
 * index names the item it stopped on by the index key and the table key
 * together, since an index key is not unique.
 */
export class SimDynamoDbItemPage {
  public readonly items: readonly SimDynamoDbItem[];
  public readonly lastEvaluatedKey:
    | Record<string, SimDynamoDbAttributeValue>
    | undefined;

  constructor(properties: SimDynamoDbItemPageProperties) {
    const limit = readLimit(properties.limit);
    const { items, stoppedEarly } = cutPage(
      properties.items,
      limit,
      properties.view,
    );

    this.items = items;
    this.lastEvaluatedKey = stoppedEarly
      ? tokenFor(properties.view, items)
      : undefined;
  }
}

/**
 * Take items off the front of the walk until the limit or the data limit is
 * reached.
 */
function cutPage(
  walked: readonly SimDynamoDbItem[],
  limit: number,
  view: SimDynamoDbReadView,
): {
  readonly items: readonly SimDynamoDbItem[];
  readonly stoppedEarly: boolean;
} {
  const items: SimDynamoDbItem[] = [];
  let bytesRead = 0;

  for (const item of walked) {
    items.push(item);
    bytesRead += view.project(item).sizeInBytes();

    if (items.length >= limit || bytesRead > simDynamoDbPageDataLimitBytes) {
      return { items, stoppedEarly: true };
    }
  }

  return { items, stoppedEarly: false };
}

/**
 * The key to resume from, naming the last item the page read.
 */
function tokenFor(
  view: SimDynamoDbReadView,
  items: readonly SimDynamoDbItem[],
): Record<string, SimDynamoDbAttributeValue> | undefined {
  const last = items.at(-1);

  return last === undefined ? undefined : view.tokenKey(last);
}

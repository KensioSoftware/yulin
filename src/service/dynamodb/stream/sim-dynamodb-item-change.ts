import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";

/**
 * One change to one item of a table, as the item store saw it happen.
 *
 * This is a transition rather than a state: what was under the key before, and
 * what is under it now. A change with no new image is a removal, one with no
 * old image is an insertion, and one with neither never happened and is never
 * reported.
 */
export interface SimDynamoDbItemChange {
  readonly oldImage: SimDynamoDbItem | undefined;
  readonly newImage: SimDynamoDbItem | undefined;

  /**
   * Whether time to live took the item, rather than a request.
   *
   * This is the one thing a stream record cannot work out from the images. It
   * is what `userIdentity` reports, and it is how an application tells its own
   * deletions from the ones it never asked for.
   */
  readonly expired: boolean;
}

/**
 * Something told about every change to a table's items.
 *
 * The item store reports to this rather than to a stream, so the store stays
 * unaware of whether the table it holds items for has a stream at all.
 */
export interface SimDynamoDbItemChanges {
  /**
   * Take a change that has already happened to the table's items.
   */
  capture(change: SimDynamoDbItemChange): void;
}

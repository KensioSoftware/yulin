/**
 * A page of items cut out of a listing that is walked in key order.
 *
 * Kinesis pages by naming the item to start after, so a page is whatever
 * follows that key up to the limit. The next token is the last item of this
 * page, and it is absent once the page reaches the end of the listing.
 */
export class SimKinesisPage<T> {
  public readonly items: readonly T[];
  public readonly hasMore: boolean;

  /**
   * Cut a page out of a listing.
   *
   * The start is the first key after the one given rather than the position of
   * that key itself, so a continuation key naming an item that has since gone,
   * or one that was never there, lands where it belongs in the order. Searching
   * for an exact match would fail to find it and quietly start again from the
   * beginning, which is a repeated first page and a paging loop that never
   * ends.
   */
  constructor(
    all: readonly T[],
    keyOf: (item: T) => string,
    after: string | undefined,
    limit: number,
  ) {
    const start = after === undefined ? 0 : firstKeyAfter(all, keyOf, after);

    this.items = all.slice(start, start + limit);
    this.hasMore = start + this.items.length < all.length;
  }
}

/**
 * Where in a key-ordered listing the items after a key begin.
 *
 * The listing runs past its end when every key is at or before the one given,
 * which is an empty last page rather than anything wrong.
 */
function firstKeyAfter<T>(
  all: readonly T[],
  keyOf: (item: T) => string,
  after: string,
): number {
  const found = all.findIndex((item) => keyOf(item) > after);

  return found === -1 ? all.length : found;
}

/**
 * A page of items cut out of a listing that is walked in order.
 *
 * Kinesis pages by naming the last item of the page before, so a page is
 * whatever follows that item up to the limit. The next token is the last item
 * of this page, and it is absent once the page reaches the end of the listing.
 */
export class SimKinesisPage<T> {
  public readonly items: readonly T[];
  public readonly hasMore: boolean;

  constructor(
    all: readonly T[],
    keyOf: (item: T) => string,
    after: string | undefined,
    limit: number,
  ) {
    const start =
      after === undefined
        ? 0
        : all.findIndex((item) => keyOf(item) === after) + 1;

    this.items = all.slice(start, start + limit);
    this.hasMore = start + this.items.length < all.length;
  }
}

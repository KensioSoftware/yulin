import type { SimFirehoseDeliveryStream } from "../../stream/sim-firehose-delivery-stream.js";

/**
 * A page of delivery streams cut out of a listing walked in name order.
 *
 * Firehose pages by naming the delivery stream to start after, so a page is
 * whatever follows that name up to the limit.
 *
 * The start is the first name after the one given rather than the position of
 * that name itself. A continuation name whose delivery stream has since been
 * deleted then lands where it belongs in the order. Searching for an exact
 * match would fail to find it and quietly start again from the beginning,
 * which is a repeated first page and a paging loop that never ends.
 */
export class SimFirehoseDeliveryStreamPage {
  public readonly items: readonly SimFirehoseDeliveryStream[];
  public readonly hasMore: boolean;

  constructor(
    all: readonly SimFirehoseDeliveryStream[],
    after: string | undefined,
    limit: number,
  ) {
    const remaining =
      after === undefined
        ? all
        : all.filter((deliveryStream) => deliveryStream.name > after);

    this.items = remaining.slice(0, limit);
    this.hasMore = remaining.length > this.items.length;
  }
}

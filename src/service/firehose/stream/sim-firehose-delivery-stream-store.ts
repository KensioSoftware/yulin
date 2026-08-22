import { SimFirehoseResourceNotFoundException } from "../error/sim-firehose.error.js";
import type { SimFirehoseDeliveryStream } from "./sim-firehose-delivery-stream.js";

/**
 * The delivery streams of one simulated Firehose scope.
 *
 * They are keyed by name, which is the whole of their identity. The name is the
 * resource part of the ARN, and it is unique within one Account and Region.
 *
 * A deleted delivery stream's name is freed straight away, as real Firehose
 * frees one.
 */
export class SimFirehoseDeliveryStreamStore {
  private readonly deliveryStreams = new Map<
    string,
    SimFirehoseDeliveryStream
  >();

  /**
   * Every delivery stream in this scope, in name order.
   *
   * ListDeliveryStreams pages by name and reports them sorted, so the order a
   * page is cut out of has to be the order the paging parameter walks.
   */
  get all(): readonly SimFirehoseDeliveryStream[] {
    return this.deliveryStreams
      .values()
      .toArray()
      .toSorted((left, right) => left.name.localeCompare(right.name));
  }

  /**
   * Store a newly created delivery stream.
   */
  add(deliveryStream: SimFirehoseDeliveryStream): void {
    this.deliveryStreams.set(deliveryStream.name, deliveryStream);
  }

  /**
   * Find a delivery stream by name.
   */
  find(name: string): SimFirehoseDeliveryStream | undefined {
    return this.deliveryStreams.get(name);
  }

  /**
   * Resolve a delivery stream by name, or refuse.
   */
  require(name: string): SimFirehoseDeliveryStream {
    const found = this.find(name);

    if (found === undefined) {
      throw new SimFirehoseResourceNotFoundException(
        `Firehose cannot find the delivery stream ${name} under this account ` +
          `and region`,
      );
    }

    return found;
  }

  /**
   * Forget a deleted delivery stream.
   */
  remove(deliveryStream: SimFirehoseDeliveryStream): void {
    this.deliveryStreams.delete(deliveryStream.name);
  }
}

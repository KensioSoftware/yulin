import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimFirehoseDelivery } from "../../delivery/sim-firehose-delivery.js";
import type { SimFirehoseFailures } from "../../failure/sim-firehose-failures.js";
import type { SimFirehoseDeliveryStream } from "../../stream/sim-firehose-delivery-stream.js";
import type { SimFirehoseRecordSource } from "../sim-firehose-record-source.js";
import type { SimFirehoseSourceFailure } from "../sim-firehose-source-failures.js";
import { SimFirehoseSourceReader } from "./sim-firehose-source-reader.js";

interface SimFirehoseSourceReadingProperties {
  readonly records: SimFirehoseRecordSource;
  readonly delivery: SimFirehoseDelivery;
  readonly failures: SimFirehoseFailures<SimFirehoseSourceFailure>;
  readonly background: BackgroundScheduler;
}

/**
 * Which delivery streams of one simulated Firehose scope are reading a stream.
 *
 * A `DirectPut` delivery stream reads nothing, so it has no reader here. The
 * readers are held by delivery stream so that deleting one stops it: a delivery
 * stream that has gone still has an iterator on its source, and leaving it
 * would go on buffering records for a destination nothing can deliver to.
 */
export class SimFirehoseSourceReading {
  private readonly properties: SimFirehoseSourceReadingProperties;
  private readonly readers = new Map<
    SimFirehoseDeliveryStream,
    SimFirehoseSourceReader
  >();

  constructor(properties: SimFirehoseSourceReadingProperties) {
    this.properties = properties;
  }

  /**
   * Start a newly created delivery stream reading its source.
   *
   * This answers once the source stream has been opened, so a record put the
   * moment CreateDeliveryStream answers lands in front of the delivery stream
   * rather than behind it.
   */
  async start(deliveryStream: SimFirehoseDeliveryStream): Promise<void> {
    const { source } = deliveryStream;

    if (source.kind !== "kinesis-stream") {
      return;
    }

    const reader = new SimFirehoseSourceReader({
      ...this.properties,
      deliveryStream,
      source,
    });

    this.readers.set(deliveryStream, reader);

    await reader.start();
  }

  /**
   * Stop a deleted delivery stream reading.
   */
  forget(deliveryStream: SimFirehoseDeliveryStream): void {
    const reader = this.readers.get(deliveryStream);

    if (reader === undefined) {
      return;
    }

    this.readers.delete(deliveryStream);
    reader.stop();
  }
}

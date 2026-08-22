import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimFirehoseDelivery } from "../../delivery/sim-firehose-delivery.js";
import type { SimFirehoseFailures } from "../../failure/sim-firehose-failures.js";
import type { SimFirehoseDeliveryStream } from "../../stream/sim-firehose-delivery-stream.js";
import type {
  SimFirehoseRecordSource,
  SimFirehoseSourceActivity,
  SimFirehoseSourceWatcher,
} from "../sim-firehose-record-source.js";
import { SimFirehoseSourceFailure } from "../sim-firehose-source-failures.js";
import type { SimFirehoseKinesisSource } from "../sim-firehose-source.js";
import { SimFirehoseSourcePoll } from "./sim-firehose-source-poll.js";
import { SimFirehoseSourceShards } from "./sim-firehose-source-shards.js";

interface SimFirehoseSourceReaderProperties {
  readonly deliveryStream: SimFirehoseDeliveryStream;
  readonly source: SimFirehoseKinesisSource;
  readonly records: SimFirehoseRecordSource;
  readonly delivery: SimFirehoseDelivery;
  readonly failures: SimFirehoseFailures<SimFirehoseSourceFailure>;
  readonly background: BackgroundScheduler;
}

/**
 * One delivery stream reading every shard of its source stream.
 *
 * The read happens on the clock. A record put onto the stream schedules a read
 * for the instant the simulation currently reads, so advancing time is what
 * moves records from the stream into the delivery stream's buffer, and the same
 * advance can then carry the buffer past its interval. Real Firehose reads
 * continuously, and nothing in this simulation runs continuously.
 *
 * Every call to the stream is made as the source Role. A Role that cannot read
 * stops the delivery, and the failure is kept for a test to read: real Firehose
 * has no caller in front of it here to raise at.
 */
export class SimFirehoseSourceReader implements SimFirehoseSourceWatcher {
  private readonly properties: SimFirehoseSourceReaderProperties;
  private readonly activity: SimFirehoseSourceActivity;
  private readonly poll: SimFirehoseSourcePoll;

  private shards = new SimFirehoseSourceShards([]);

  constructor(properties: SimFirehoseSourceReaderProperties) {
    this.properties = properties;
    this.activity = properties.records.streamActivity();
    this.poll = new SimFirehoseSourcePoll({
      background: properties.background,
      read: async (): Promise<void> => {
        await this.take();
      },
    });
  }

  /**
   * Open every shard of the source stream at its end, and watch for records.
   *
   * The shards are found before CreateDeliveryStream answers, rather than at
   * the first read. Both calls are made as the source Role, and a record put
   * the moment the delivery stream exists has to land behind a place that was
   * already taken.
   */
  async start(): Promise<void> {
    const { records, source } = this.properties;
    const streamArn = source.streamArn.value;

    try {
      this.shards = await SimFirehoseSourceShards.atLatestOf(
        records,
        streamArn,
        source.caller,
      );
    } catch (error) {
      this.failed(error);

      return;
    }

    this.activity.watch(streamArn, this);
  }

  /**
   * Read the stream once simulated time next moves.
   */
  recordsAvailable(): void {
    this.poll.soon();
  }

  /**
   * Stop reading, and give up whatever read was waiting on the clock.
   */
  stop(): void {
    this.poll.stop();
    this.activity.unwatch(this.properties.source.streamArn.value, this);
  }

  /**
   * Read the stream, and take what came back onto the buffer.
   */
  private async take(): Promise<void> {
    const { delivery, deliveryStream } = this.properties;

    try {
      const read = await this.shards.read();

      for (const record of read.records) {
        delivery.accept(deliveryStream, record.Data);
      }

      // A read that filled the request has left records behind it, so the
      // delivery stream goes round again rather than waiting for the next put.
      if (read.filled) {
        this.poll.soon();
      }
    } catch (error) {
      this.failed(error);
    }
  }

  /**
   * Give up on the source stream, and say why.
   */
  private failed(error: unknown): void {
    const { deliveryStream, source, failures } = this.properties;

    this.stop();
    failures.record(
      SimFirehoseSourceFailure.of(deliveryStream.name, source, error),
    );
  }
}

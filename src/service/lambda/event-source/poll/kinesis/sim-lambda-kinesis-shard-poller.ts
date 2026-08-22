import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import type { SimLambdaFunction } from "../../../function/sim-lambda-function.js";
import type { SimLambdaFunctionLookup } from "../../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaEventSourceMapping } from "../../sim-lambda-event-source-mapping.js";
import { simLambdaEventSourceFunction } from "../sim-lambda-event-source-function.js";
import {
  type SimLambdaEventSourcePolls,
  SimLambdaEventSourcePollTurn,
} from "../sim-lambda-event-source-poll-turn.js";
import { SimLambdaStreamProgress } from "../sim-lambda-stream-progress.js";
import type { SimLambdaKinesisPolledShard } from "./sim-lambda-kinesis-polled-shard.js";
import type { SimLambdaKinesisStreamDelivery } from "./sim-lambda-kinesis-stream-delivery.js";

interface SimLambdaKinesisShardPollerProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly functions: SimLambdaFunctionLookup;
  readonly shard: SimLambdaKinesisPolledShard;
  readonly delivery: SimLambdaKinesisStreamDelivery;
  readonly background: BackgroundScheduler;
}

/**
 * Polls one shard of one mapping's Kinesis stream and invokes its function.
 *
 * A shard is what a stream mapping actually reads, and real Lambda runs one
 * processor per shard: each keeps its own place, delivers its own batches, and
 * backs off on its own when a batch fails. That is why the checkpoint, the
 * retry backoff and the turn all live here rather than on the stream poller
 * above, which owns one of these per shard.
 *
 * Nothing else may read this shard while a delivery is in flight. A read record
 * stays where it is, unlike a received message, so a second poll overlapping
 * the first would hand the same records to the function twice.
 */
export class SimLambdaKinesisShardPoller implements SimLambdaEventSourcePolls {
  private readonly mapping: SimLambdaEventSourceMapping;
  private readonly functions: SimLambdaFunctionLookup;
  private readonly shard: SimLambdaKinesisPolledShard;
  private readonly delivery: SimLambdaKinesisStreamDelivery;
  private readonly progress: SimLambdaStreamProgress;
  private readonly turn = new SimLambdaEventSourcePollTurn(this);

  private stopped = false;

  constructor(properties: SimLambdaKinesisShardPollerProperties) {
    this.mapping = properties.mapping;
    this.functions = properties.functions;
    this.shard = properties.shard;
    this.delivery = properties.delivery;
    this.progress = new SimLambdaStreamProgress({
      mapping: properties.mapping,
      background: properties.background,
      poll: async (): Promise<void> => {
        await this.turn.take();
      },
    });
  }

  /** Poll this shard as soon as the simulation gets to it. */
  pollNow(): void {
    this.progress.pollNow();
  }

  /** Stop polling this shard. */
  stop(): void {
    this.stopped = true;
  }

  /**
   * Note a record put onto the stream, answering with whether this mapping's
   * own function put it.
   */
  noteRecordWritten(): boolean {
    return this.delivery.noteRecordWritten();
  }

  /**
   * Read one batch off this shard, deliver it, and decide what happens next.
   *
   * Only ever called through the turn, which is what keeps two polls from
   * reading the same records.
   */
  async poll(): Promise<void> {
    const simFunction = this.pollingFunction();

    if (simFunction === undefined) {
      return;
    }

    const { progress } = this;
    // Reading is done as the function's execution role, as on real Lambda, so
    // simulated IAM decides whether this mapping may read its stream.
    const batch = await this.shard.read(
      progress.position,
      this.mapping.batchSize,
    );

    if (batch.records.length === 0) {
      progress.caughtUp(batch);

      return;
    }

    progress.after(await this.delivery.to(simFunction, batch.records), batch);
  }

  /**
   * The function this mapping delivers to, while it should be delivering.
   */
  private pollingFunction(): SimLambdaFunction | undefined {
    if (this.stopped || !this.mapping.isPolling) {
      return undefined;
    }

    return simLambdaEventSourceFunction(this.functions, this.mapping);
  }
}

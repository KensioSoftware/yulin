import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import { PollSchedule } from "../../../../../util/background/poll-schedule.js";
import type { SimLambdaFunctionLookup } from "../../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaEventSourceMapping } from "../../sim-lambda-event-source-mapping.js";
import type { SimLambdaKinesisEventSourceArn } from "../../stream/kinesis/sim-lambda-kinesis-event-source-arn.js";
import type { SimLambdaKinesisStreams } from "../../stream/kinesis/sim-lambda-kinesis-streams.js";
import type { SimLambdaEventSourcePoller } from "../sim-lambda-event-source-poller.js";
import { SimLambdaKinesisShardPollers } from "./sim-lambda-kinesis-shard-pollers.js";

interface SimLambdaKinesisStreamEventSourcePollerProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaKinesisEventSourceArn;
  readonly functions: SimLambdaFunctionLookup;
  readonly kinesisStreams: SimLambdaKinesisStreams;
  readonly background: BackgroundScheduler;
}

/**
 * Polls one event source mapping's Kinesis stream and invokes its function.
 *
 * A Kinesis stream has as many shards as it was created with, and real Lambda
 * reads every one of them with a processor of its own. This owns one shard
 * poller per shard and does nothing itself but pass the wake-ups on. Everything
 * that makes a stream mapping what it is, the checkpoint, the backoff and the
 * one-poll-at-a-time turn, belongs to a shard rather than to the stream.
 *
 * That is the difference from the DynamoDB stream poller, which is the whole of
 * itself because a simulated table's stream has one shard.
 */
export class SimLambdaKinesisStreamEventSourcePoller implements SimLambdaEventSourcePoller {
  private readonly streamArn: string;
  private readonly kinesisStreams: SimLambdaKinesisStreams;
  private readonly shardPollers: SimLambdaKinesisShardPollers;
  private readonly schedule: PollSchedule;

  constructor(properties: SimLambdaKinesisStreamEventSourcePollerProperties) {
    this.streamArn = properties.eventSourceArn.value;
    this.kinesisStreams = properties.kinesisStreams;
    this.shardPollers = new SimLambdaKinesisShardPollers(properties);
    this.schedule = new PollSchedule({
      background: properties.background,
      poll: async (): Promise<void> => {
        await this.pollShards();
      },
    });
  }

  /**
   * Watch the stream this mapping polls.
   *
   * Watching starts as soon as the mapping is created, before it has finished
   * creating, so a record put in between is not missed. The poll it wakes finds
   * a mapping that is not polling yet and does nothing, and the poll that
   * follows activation reads from the starting position.
   */
  watch(): void {
    this.kinesisStreams.watch(this.streamArn, this);
  }

  /**
   * Poll as soon as the simulation gets to it, which is what a newly enabled
   * mapping does with whatever its stream already holds.
   */
  pollNow(): void {
    this.schedule.now();
  }

  /**
   * Stop polling, as deleting the mapping does.
   */
  stop(): void {
    this.schedule.stop();
    this.kinesisStreams.unwatch(this.streamArn, this);
    this.shardPollers.stop();
  }

  /**
   * Take a record arriving on the stream as something to poll for.
   *
   * A record put while this mapping's own function is running is the function
   * writing back into its own source stream. That never settles, so the mapping
   * stops here and the delivery refuses once it is over. Only the shard that is
   * mid-delivery answers, since only it is inside the delivery.
   */
  recordsAvailable(): void {
    const cascading = this.shardPollers.made.some((shardPoller) =>
      shardPoller.noteRecordWritten(),
    );

    if (cascading) {
      this.stop();

      return;
    }

    this.schedule.now();
  }

  /**
   * Poll every shard of the stream.
   *
   * Each shard takes its own turn from here, so a shard that is mid-delivery
   * notes the wake-up and comes back to it rather than reading twice.
   */
  private async pollShards(): Promise<void> {
    const polling = await this.shardPollers.polling();

    for (const shardPoller of polling) {
      shardPoller.pollNow();
    }
  }
}

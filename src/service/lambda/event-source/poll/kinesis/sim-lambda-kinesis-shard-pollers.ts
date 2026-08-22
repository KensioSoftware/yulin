import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import type { SimLambdaFunctionLookup } from "../../../function/url/sim-lambda-function-lookup.js";
import type { SimLambdaEventSourceMapping } from "../../sim-lambda-event-source-mapping.js";
import type { SimLambdaKinesisEventSourceArn } from "../../stream/kinesis/sim-lambda-kinesis-event-source-arn.js";
import type { SimLambdaKinesisStreams } from "../../stream/kinesis/sim-lambda-kinesis-streams.js";
import { simLambdaEventSourceFunction } from "../sim-lambda-event-source-function.js";
import { SimLambdaKinesisPolledShard } from "./sim-lambda-kinesis-polled-shard.js";
import { SimLambdaKinesisShardPoller } from "./sim-lambda-kinesis-shard-poller.js";
import { SimLambdaKinesisStreamDelivery } from "./sim-lambda-kinesis-stream-delivery.js";

interface SimLambdaKinesisShardPollersProperties {
  readonly mapping: SimLambdaEventSourceMapping;
  readonly eventSourceArn: SimLambdaKinesisEventSourceArn;
  readonly functions: SimLambdaFunctionLookup;
  readonly kinesisStreams: SimLambdaKinesisStreams;
  readonly background: BackgroundScheduler;
}

/**
 * The shard pollers of one mapping's stream, found once and kept.
 *
 * The shards are found on the first poll rather than when the mapping is
 * created, because finding them is a DescribeStream call made as the function's
 * execution role, and the function is what a poll starts from. Nothing here
 * reshards, so the answer never changes.
 */
export class SimLambdaKinesisShardPollers {
  private readonly properties: SimLambdaKinesisShardPollersProperties;
  private held: readonly SimLambdaKinesisShardPoller[] | undefined;

  constructor(properties: SimLambdaKinesisShardPollersProperties) {
    this.properties = properties;
  }

  /**
   * The shard pollers made so far, which is none until the first poll.
   */
  get made(): readonly SimLambdaKinesisShardPoller[] {
    return this.held ?? [];
  }

  /**
   * The shard pollers of this stream, making them if this is the first poll.
   *
   * A mapping that is not polling yet, or whose function has gone, has none:
   * there is nothing to poll as, and the poll that follows activation makes
   * them.
   */
  async polling(): Promise<readonly SimLambdaKinesisShardPoller[]> {
    const held = this.held;

    if (held !== undefined) {
      return held;
    }

    const { mapping, functions } = this.properties;

    if (!mapping.isPolling) {
      return [];
    }

    const simFunction = simLambdaEventSourceFunction(functions, mapping);

    if (simFunction === undefined) {
      return [];
    }

    const made = await this.forRole(simFunction.roleArn);
    this.held ??= made;

    return this.held;
  }

  /**
   * One poller for each shard the stream reports.
   *
   * Each gets its own shard to read and its own delivery, because the event a
   * function receives names the shard its records came from and each shard's
   * batches are answered for on their own.
   */
  private async forRole(
    roleArn: string,
  ): Promise<readonly SimLambdaKinesisShardPoller[]> {
    const { mapping, eventSourceArn, kinesisStreams, background, functions } =
      this.properties;
    const shardIds = await kinesisStreams.shardIds({
      streamArn: eventSourceArn.value,
      caller: { kind: "arn", arn: roleArn },
    });

    return shardIds.map(
      (shardId) =>
        new SimLambdaKinesisShardPoller({
          mapping,
          functions,
          background,
          shard: new SimLambdaKinesisPolledShard({
            streams: kinesisStreams,
            streamArn: eventSourceArn.value,
            shardId,
            roleArn,
          }),
          delivery: new SimLambdaKinesisStreamDelivery({
            mapping,
            eventSourceArn,
            shardId,
            roleArn,
          }),
        }),
    );
  }
}

import { SimLambdaError } from "../../../error/sim-lambda.error.js";
import type { SimLambdaEventSourceStreamRequest } from "../sim-lambda-event-source-streams.js";
import type { SimLambdaKinesisStreamCommands } from "./sim-lambda-kinesis-stream-service.js";

/**
 * How many shards one DescribeStream page asks for.
 *
 * The stream is walked to the end rather than read one page deep, so a mapping
 * on a stream with more shards than a page holds still reads all of them.
 */
const shardPageSize = 100;

/**
 * The shards of the stream a mapping polls.
 *
 * This is a DescribeStream call, which is also how a mapping finds out whether
 * the stream it names is there at all. Real Lambda needs the same permission
 * for the same reason.
 */
export class SimKinesisEventSourceShards {
  private readonly commands: SimLambdaKinesisStreamCommands;

  constructor(commands: SimLambdaKinesisStreamCommands) {
    this.commands = commands;
  }

  /**
   * Every shard of a stream, in the order the stream reports them.
   */
  async shardIds(
    request: SimLambdaEventSourceStreamRequest,
  ): Promise<readonly string[]> {
    const { streamArn, caller } = request;
    const shardIds: string[] = [];
    let after: string | undefined;

    do {
      // oxlint-disable-next-line no-await-in-loop
      const described = await this.commands.describeStream(
        {
          input: {
            StreamARN: streamArn,
            Limit: shardPageSize,
            ...(after !== undefined && { ExclusiveStartShardId: after }),
          },
        },
        { caller },
      );
      const page = described.StreamDescription;

      shardIds.push(...namedShardsOf(page.Shards, streamArn));
      after = page.HasMoreShards === true ? shardIds.at(-1) : undefined;
    } while (after !== undefined);

    if (shardIds.length === 0) {
      throw new SimLambdaError(
        `Stream ${streamArn} reports no shards to poll records from`,
      );
    }

    return shardIds;
  }
}

/**
 * The identifiers a page of shards carries.
 *
 * A shard with no identifier is one nothing can ask for a place on, so it is
 * refused here rather than skipped: a mapping quietly reading fewer shards than
 * the stream has would drop records with nothing to point at.
 */
function namedShardsOf(
  shards: readonly { readonly ShardId?: string | undefined }[] | undefined,
  streamArn: string,
): readonly string[] {
  return (shards ?? []).map((shard) => {
    const { ShardId } = shard;

    if (ShardId === undefined || ShardId === "") {
      throw new SimLambdaError(
        `Stream ${streamArn} reports a shard with no ShardId, which nothing ` +
          "can read from",
      );
    }

    return ShardId;
  });
}

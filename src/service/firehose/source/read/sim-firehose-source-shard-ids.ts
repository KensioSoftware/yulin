import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimFirehoseError } from "../../error/sim-firehose.error.js";
import type {
  SimFirehoseRecordSource,
  SimFirehoseSourceShardDescription,
} from "../sim-firehose-record-source.js";

/**
 * How many shards one DescribeStream page asks for.
 *
 * The stream is walked to the end rather than read one page deep, so a delivery
 * stream on a stream with more shards than a page holds still reads all of
 * them.
 */
const shardPageSize = 100;

/**
 * Every shard of the stream a delivery stream reads, in the order the stream
 * reports them.
 *
 * This is a DescribeStream call, which is also how a delivery stream finds out
 * whether the stream it names is there at all. Real Firehose needs the same
 * permission for the same reason.
 */
export async function simFirehoseSourceShardIds(
  records: SimFirehoseRecordSource,
  streamArn: string,
  caller: SimAwsCaller,
): Promise<readonly string[]> {
  const shardIds: string[] = [];
  let after: string | undefined;

  do {
    // oxlint-disable-next-line no-await-in-loop
    const described = await records.describeStream(
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
    throw new SimFirehoseError(
      `Stream ${streamArn} reports no shards to read records from`,
    );
  }

  return shardIds;
}

/**
 * The identifiers a page of shards carries.
 *
 * A shard with no identifier is one nothing can ask for a place on, so it is
 * refused here rather than skipped: a delivery stream quietly reading fewer
 * shards than the stream has would drop records with nothing to point at.
 */
function namedShardsOf(
  shards: readonly SimFirehoseSourceShardDescription[] | undefined,
  streamArn: string,
): readonly string[] {
  return (shards ?? []).map((shard) => {
    const { ShardId } = shard;

    if (ShardId === undefined || ShardId === "") {
      throw new SimFirehoseError(
        `Stream ${streamArn} reports a shard with no ShardId, which nothing ` +
          "can read from",
      );
    }

    return ShardId;
  });
}

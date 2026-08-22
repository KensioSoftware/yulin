import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type {
  SimFirehoseRecordSource,
  SimFirehoseSourceRecord,
} from "../sim-firehose-record-source.js";
import { SimFirehoseSourceShard } from "./sim-firehose-source-shard.js";
import { simFirehoseSourceShardIds } from "./sim-firehose-source-shard-ids.js";

/**
 * How many records one read of a shard asks for, which is the most one
 * GetRecords call hands back.
 */
const shardReadLimit = 10_000;

/**
 * What one read across every shard came back with.
 *
 * `filled` says a shard handed back everything it was asked for, which means
 * there are records behind what came back.
 */
export interface SimFirehoseSourceRead {
  readonly records: readonly SimFirehoseSourceRecord[];
  readonly filled: boolean;
}

/**
 * Every shard of the stream one delivery stream reads.
 *
 * A Kinesis stream has as many shards as it was created with, and nothing here
 * reshards, so they are found once and kept. All of them are read, because a
 * delivery stream delivers the whole stream rather than part of it.
 */
export class SimFirehoseSourceShards {
  private readonly shards: readonly SimFirehoseSourceShard[];

  /**
   * Hold the shards given, which is none for a delivery stream that has yet to
   * open its stream.
   */
  constructor(shards: readonly SimFirehoseSourceShard[]) {
    this.shards = shards;
  }

  /**
   * Find every shard of a stream and open each at the end of it, as the source
   * Role.
   */
  static async atLatestOf(
    records: SimFirehoseRecordSource,
    streamArn: string,
    caller: SimAwsCaller,
  ): Promise<SimFirehoseSourceShards> {
    const shardIds = await simFirehoseSourceShardIds(
      records,
      streamArn,
      caller,
    );
    const shards = await Promise.all(
      shardIds.map(async (shardId) =>
        SimFirehoseSourceShard.atLatest({
          records,
          streamArn,
          shardId,
          caller,
        }),
      ),
    );

    return new this(shards);
  }

  /**
   * Read every shard, in the order the stream reported them.
   *
   * Real Firehose reads its shards in parallel too, and the order records from
   * different shards land in one Object is nothing it promises. Reporting them
   * shard by shard is what keeps a simulated delivery deterministic.
   */
  async read(): Promise<SimFirehoseSourceRead> {
    const reads = await Promise.all(
      this.shards.map(async (shard) => await shard.read(shardReadLimit)),
    );

    return {
      records: reads.flat(),
      filled: reads.some((records) => records.length === shardReadLimit),
    };
  }
}

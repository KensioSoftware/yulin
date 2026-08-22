import { assertDefined } from "../../../util/type-guard/defined.js";
import { simKinesisHashKeyRanges } from "./sim-kinesis-hash-key.js";
import type { SimKinesisSequenceNumbers } from "./sim-kinesis-sequence-numbers.js";
import { SimKinesisShard } from "./sim-kinesis-shard.js";

interface SimKinesisShardMapProperties {
  readonly shardCount: number;
  readonly sequenceNumbers: SimKinesisSequenceNumbers;
}

/**
 * The shards of one stream, and which slice of the hash key space each holds.
 *
 * The shards are opened together and stay as they are. Nothing here splits or
 * merges one, so a record's shard is decided by its hash key alone and stays
 * decidable for the life of the stream.
 */
export class SimKinesisShardMap {
  public readonly shards: readonly SimKinesisShard[];

  constructor(properties: SimKinesisShardMapProperties) {
    this.shards = simKinesisHashKeyRanges(properties.shardCount).map(
      (hashKeyRange, ordinal) =>
        new SimKinesisShard({
          ordinal,
          hashKeyRange,
          startingSequenceNumber: properties.sequenceNumbers.take(),
        }),
    );
  }

  /**
   * Find a shard by its identifier.
   */
  find(shardId: string): SimKinesisShard | undefined {
    return this.shards.find((shard) => shard.shardId === shardId);
  }

  /**
   * The shard whose slice of the hash key space a key falls in.
   *
   * The ranges cover the whole space between them, so one of them always
   * matches whatever a 128 bit hash lands on.
   */
  covering(hashKey: bigint): SimKinesisShard {
    const shard = this.shards.find((candidate) => candidate.covers(hashKey));
    assertDefined(shard, `Kinesis shard covering hash key ${hashKey}`);

    return shard;
  }

  /**
   * Drop the records put before an instant, on every shard.
   */
  trim(before: Date): void {
    for (const shard of this.shards) {
      shard.trim(before);
    }
  }
}

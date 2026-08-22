import { createHash } from "node:crypto";

/**
 * How many hash keys the space a stream's shards divide holds.
 *
 * Kinesis hashes a partition key to a 128 bit unsigned integer, so the space
 * runs from zero to one less than this.
 */
export const simKinesisHashKeySpace = 2n ** 128n;

/**
 * The 128 bit hash key a partition key falls on.
 *
 * This is MD5 read as a big-endian unsigned integer, which is what real Kinesis
 * does. The hash is a placement function rather than a security one, so MD5
 * being broken is beside the point: using anything else would put a record on a
 * different shard from the one AWS would have put it on.
 */
export function simKinesisPartitionKeyHash(partitionKey: string): bigint {
  const digest = createHash("md5").update(partitionKey, "utf8").digest("hex");

  return BigInt(`0x${digest}`);
}

/**
 * The half-open bounds of one shard's slice of the hash key space.
 */
export interface SimKinesisHashKeyRange {
  readonly startingHashKey: bigint;
  readonly endingHashKey: bigint;
}

/**
 * Divide the hash key space between a number of shards.
 *
 * The slices are equal and adjacent, with the last one taking whatever the
 * division left over, so together they cover the whole space with no gap and no
 * overlap. That is what real Kinesis gives a stream created with a shard count,
 * before anything reshards it.
 */
export function simKinesisHashKeyRanges(
  shardCount: number,
): readonly SimKinesisHashKeyRange[] {
  const span = simKinesisHashKeySpace / BigInt(shardCount);

  return Array.from({ length: shardCount }, (_unused, index) => ({
    startingHashKey: span * BigInt(index),
    endingHashKey:
      (index === shardCount - 1
        ? simKinesisHashKeySpace
        : span * BigInt(index + 1)) - 1n,
  }));
}

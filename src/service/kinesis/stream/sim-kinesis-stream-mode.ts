import { SimKinesisInvalidArgumentException } from "../error/sim-kinesis.error.js";

/**
 * How a stream's capacity is decided.
 */
export type SimKinesisStreamMode = "PROVISIONED" | "ON_DEMAND";

/**
 * How many shards an on-demand stream starts with.
 *
 * Real Kinesis gives an on-demand stream four shards and grows it with the
 * traffic. Nothing here measures traffic, so the count stays where it starts.
 */
export const simKinesisOnDemandShardCount = 4;

/**
 * The most shards real Kinesis creates a stream with.
 */
const maxShardCount = 100_000;

/**
 * Read the stream mode a request asked for.
 */
export function simKinesisStreamModeOf(
  mode: string | undefined,
): SimKinesisStreamMode {
  if (mode === undefined || mode === "PROVISIONED") {
    return "PROVISIONED";
  }

  if (mode === "ON_DEMAND") {
    return "ON_DEMAND";
  }

  throw new SimKinesisInvalidArgumentException(
    `StreamModeDetails.StreamMode '${mode}' is neither PROVISIONED nor ` +
      `ON_DEMAND`,
  );
}

/**
 * How many shards a stream is created with.
 *
 * An on-demand stream takes no shard count, and real Kinesis refuses a request
 * carrying both. A provisioned stream created without one gets a single shard,
 * which is what real Kinesis does.
 */
export function simKinesisCreatedShardCount(
  mode: SimKinesisStreamMode,
  shardCount: number | undefined,
): number {
  if (mode === "ON_DEMAND") {
    if (shardCount !== undefined) {
      throw new SimKinesisInvalidArgumentException(
        "ShardCount may not be set on a stream created in ON_DEMAND mode",
      );
    }

    return simKinesisOnDemandShardCount;
  }

  if (shardCount === undefined) {
    return 1;
  }

  if (!Number.isSafeInteger(shardCount) || shardCount < 1) {
    throw new SimKinesisInvalidArgumentException(
      `ShardCount ${shardCount} is not a whole number of shards`,
    );
  }

  if (shardCount > maxShardCount) {
    throw new SimKinesisInvalidArgumentException(
      `ShardCount ${shardCount} is more than the ${maxShardCount} shards ` +
        `Kinesis creates a stream with`,
    );
  }

  return shardCount;
}

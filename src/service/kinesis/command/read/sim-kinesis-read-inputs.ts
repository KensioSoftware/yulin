import { SimKinesisInvalidArgumentException } from "../../error/sim-kinesis.error.js";

/**
 * The most records real Kinesis hands back from one GetRecords call.
 */
const maxRecordLimit = 10_000;

/**
 * The shard identifier a GetShardIterator request has to carry.
 */
export function simKinesisRequiredShardId(shardId: string | undefined): string {
  if (shardId === undefined || shardId === "") {
    throw new SimKinesisInvalidArgumentException(
      "GetShardIterator requires a ShardId",
    );
  }

  return shardId;
}

/**
 * How many records a GetRecords request asked for.
 */
export function simKinesisReadLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return maxRecordLimit;
  }

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxRecordLimit) {
    throw new SimKinesisInvalidArgumentException(
      `Limit ${limit} is outside the 1 to ${maxRecordLimit} records Kinesis ` +
        `hands back from one GetRecords call`,
    );
  }

  return limit;
}

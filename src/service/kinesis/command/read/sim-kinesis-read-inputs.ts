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

/**
 * Refuse a request whose StreamARN disagrees with the iterator it carries.
 *
 * GetRecords takes both, and the iterator is the one that decides which stream
 * is read. A request naming a different stream is refused rather than answered
 * from the iterator's, since a caller that believed the ARN would be reading
 * somewhere other than where it thinks.
 */
export function assertSimKinesisStreamArnMatches(
  streamArn: string | undefined,
  iteratorStreamArn: string,
): void {
  if (
    streamArn !== undefined &&
    streamArn !== "" &&
    streamArn !== iteratorStreamArn
  ) {
    throw new SimKinesisInvalidArgumentException(
      `StreamARN ${streamArn} is not the stream the ShardIterator was made ` +
        `on, which is ${iteratorStreamArn}`,
    );
  }
}

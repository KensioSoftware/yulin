import type { SimKinesisShard } from "../../stream/sim-kinesis-shard.js";
import type { SimKinesisStream } from "../../stream/sim-kinesis-stream.js";
import { SimKinesisPage } from "../sim-kinesis-page.js";
import type {
  SimDescribeStreamCommandInput,
  SimKinesisShardOutput,
  SimKinesisStreamDescription,
  SimKinesisStreamDescriptionSummary,
  SimKinesisStreamSummary,
} from "./stream.command.js";

/**
 * How many shards DescribeStream reports when a request asks for no limit.
 */
const defaultShardLimit = 100;

/**
 * One shard, as DescribeStream reports it.
 *
 * The hash key bounds are decimal strings because the space runs to 2^128. The
 * ending sequence number is absent, which is how a reader tells a shard that is
 * still taking records from one it can finish with. Nothing here closes a
 * shard.
 */
function shardOutput(shard: SimKinesisShard): SimKinesisShardOutput {
  return {
    ShardId: shard.shardId,
    HashKeyRange: {
      StartingHashKey: shard.hashKeyRange.startingHashKey.toString(),
      EndingHashKey: shard.hashKeyRange.endingHashKey.toString(),
    },
    SequenceNumberRange: {
      StartingSequenceNumber: shard.startingSequenceNumber,
    },
  };
}

/**
 * One stream, as ListStreams reports it.
 */
export function streamSummary(
  stream: SimKinesisStream,
): SimKinesisStreamSummary {
  return {
    StreamName: stream.name,
    StreamARN: stream.arn,
    StreamStatus: stream.status,
    StreamModeDetails: { StreamMode: stream.mode },
    StreamCreationTimestamp: stream.createdAt,
  };
}

/**
 * One stream and a page of its shards, as DescribeStream reports them.
 */
export function streamDescription(
  stream: SimKinesisStream,
  input: SimDescribeStreamCommandInput,
): SimKinesisStreamDescription {
  const page = new SimKinesisPage(
    stream.shards,
    (shard) => shard.shardId,
    input.ExclusiveStartShardId,
    input.Limit ?? defaultShardLimit,
  );

  return {
    StreamName: stream.name,
    StreamARN: stream.arn,
    StreamStatus: stream.status,
    StreamModeDetails: { StreamMode: stream.mode },
    Shards: page.items.map((shard) => shardOutput(shard)),
    HasMoreShards: page.hasMore,
    RetentionPeriodHours: stream.retentionHours,
    StreamCreationTimestamp: stream.createdAt,
    EnhancedMonitoring: [],
  };
}

/**
 * One stream without its shards, as DescribeStreamSummary reports it.
 *
 * The consumer count is zero because enhanced fan-out is unsimulated, so
 * nothing here registers a consumer against a stream.
 */
export function streamDescriptionSummary(
  stream: SimKinesisStream,
): SimKinesisStreamDescriptionSummary {
  return {
    StreamName: stream.name,
    StreamARN: stream.arn,
    StreamStatus: stream.status,
    StreamModeDetails: { StreamMode: stream.mode },
    RetentionPeriodHours: stream.retentionHours,
    StreamCreationTimestamp: stream.createdAt,
    EnhancedMonitoring: [],
    OpenShardCount: stream.shards.length,
    ConsumerCount: 0,
  };
}

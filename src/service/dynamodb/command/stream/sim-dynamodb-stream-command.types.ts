/**
 * The sim DynamoDB Streams Command types, gathered for the service facade.
 */
export type {
  SimListStreamsCommand,
  SimListStreamsCommandInput,
  SimListStreamsCommandOutput,
} from "./list-streams/list-streams.command.js";
export type {
  SimDescribeStreamCommand,
  SimDescribeStreamCommandInput,
  SimDescribeStreamCommandOutput,
} from "./describe-stream/describe-stream.command.js";
export type {
  SimGetShardIteratorCommand,
  SimGetShardIteratorCommandInput,
  SimGetShardIteratorCommandOutput,
} from "./get-shard-iterator/get-shard-iterator.command.js";
export type {
  SimGetRecordsCommand,
  SimGetRecordsCommandInput,
  SimGetRecordsCommandOutput,
} from "./get-records/get-records.command.js";

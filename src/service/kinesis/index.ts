export { SimKinesis } from "./sim-kinesis.js";
export type { SimKinesisRequestOptions } from "./command/sim-kinesis-request-options.js";
export type * from "./command/sim-kinesis-command.types.js";
export { SimKinesisStream } from "./stream/sim-kinesis-stream.js";
export type { SimKinesisStreamStatus } from "./stream/sim-kinesis-stream.js";
export { SimKinesisShard } from "./stream/sim-kinesis-shard.js";
export type { SimKinesisStreamMode } from "./stream/sim-kinesis-stream-mode.js";
export {
  parseSimKinesisStreamArn,
  simKinesisStreamArn,
} from "./stream/sim-kinesis-stream-arn.js";
export type { SimKinesisStreamLocation } from "./stream/sim-kinesis-stream-arn.js";
export {
  simKinesisHashKeyRanges,
  simKinesisPartitionKeyHash,
} from "./stream/sim-kinesis-hash-key.js";
export type { SimKinesisHashKeyRange } from "./stream/sim-kinesis-hash-key.js";
export { simKinesisDefaultRetentionHours } from "./stream/sim-kinesis-retention.js";
export {
  SimKinesisError,
  SimKinesisExpiredIteratorException,
  SimKinesisInvalidArgumentException,
  SimKinesisResourceInUseException,
  SimKinesisResourceNotFoundException,
} from "./error/sim-kinesis.error.js";

/**
 * The AWS::Lambda::EventSourceMapping properties this simulation acts on.
 *
 * The two starting position properties are here rather than among the
 * unsimulated ones because whether a mapping may carry one is the event
 * source's own rule: a stream has to be given a position and a queue is refused
 * for naming one. That is decided by CreateEventSourceMapping, which knows
 * which source the ARN names, so both are read and passed on. The two
 * failed-batch limits are read for the same reason: a stream mapping keeps them
 * and a queue mapping is refused for naming one.
 */
export const simulatedPropertyNames: ReadonlySet<string> = new Set([
  "BatchSize",
  "Enabled",
  "EventSourceArn",
  "FunctionName",
  "FunctionResponseTypes",
  "MaximumBatchingWindowInSeconds",
  "MaximumRecordAgeInSeconds",
  "MaximumRetryAttempts",
  "BisectBatchOnFunctionError",
  "DestinationConfig",
  "StartingPosition",
  "StartingPositionTimestamp",
]);

/**
 * The event sources a mapping property can only be configuring, none of which
 * this simulation has.
 *
 * A mapping naming one of these has an event source ARN to match, and that ARN
 * is what the mapping is refused on. The property beside it is recorded.
 */
const absentEventSource =
  "the mapping polls the source its EventSourceArn names, and this " +
  "simulation has SQS queues, DynamoDB streams and Kinesis streams";

/**
 * Real AWS::Lambda::EventSourceMapping properties this simulation does not act
 * on, and what the mapping does in place of each.
 *
 * Every one of them changes what the function sees or when it sees it. That is
 * what the record against the Resource is for. A mapping created without one
 * still carries the records the template asked for to the function the
 * template named, and the difference is there to be read.
 */
export const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  ["AmazonManagedKafkaEventSourceConfig", absentEventSource],
  ["DocumentDBEventSourceConfig", absentEventSource],
  [
    "FilterCriteria",
    "every record on the event source is delivered to the function, unfiltered",
  ],
  [
    "KmsKeyArn",
    "the key encrypts filter criteria, and filter criteria are not simulated",
  ],
  ["MetricsConfig", "the mapping publishes no CloudWatch metrics"],
  [
    "ParallelizationFactor",
    "polling concurrency is not simulated, and each shard of a stream is read " +
      "by one reader",
  ],
  ["ProvisionedPollerConfig", "polling concurrency is not simulated"],
  ["Queues", absentEventSource],
  ["ScalingConfig", "polling concurrency is not simulated"],
  ["SelfManagedEventSource", absentEventSource],
  ["SelfManagedKafkaEventSourceConfig", absentEventSource],
  [
    "SourceAccessConfigurations",
    "event source authentication is not simulated",
  ],
  [
    "Tags",
    "the mapping is created without them, and nothing reads them back or " +
      "groups or bills by them",
  ],
  ["Topics", absentEventSource],
  [
    "TumblingWindowInSeconds",
    "a batch carries no window state from the batch before it, and the " +
      "function is handed no state to return",
  ],
]);

/**
 * Why a property name this simulation has never heard of is recorded.
 *
 * A typo and a property AWS added after this simulation read the docs look
 * identical from here. A mapping that deploys with the unread name reported is
 * more use than a stack that fails over either.
 */
export const unknownPropertyReason =
  "it is not an AWS::Lambda::EventSourceMapping property this simulation " +
  "knows, whether because AWS added it or because the template misspelled " +
  "something";

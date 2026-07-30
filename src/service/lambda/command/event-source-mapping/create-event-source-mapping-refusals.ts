import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import type { SimCreateEventSourceMappingCommandInput } from "./event-source-mapping.command.js";

/**
 * The inputs a mapping cannot be created with here, and why each is refused.
 *
 * Every one of them changes what a function sees or when it sees it, so
 * accepting and ignoring one would let a test pass on behaviour the deployment
 * would not have.
 */
const unsimulatedInputs: ReadonlyMap<string, string> = new Map([
  ["FilterCriteria", "event filtering is not simulated"],
  ["ScalingConfig", "polling concurrency is not simulated"],
  ["ProvisionedPollerConfig", "polling concurrency is not simulated"],
  ["DestinationConfig", "failure destinations are not simulated"],
  ["MaximumRetryAttempts", "retry limits are not simulated"],
  ["MaximumRecordAgeInSeconds", "record ages are not simulated"],
  ["BisectBatchOnFunctionError", "batch bisection is not simulated"],
  ["ParallelizationFactor", "polling concurrency is not simulated"],
  ["TumblingWindowInSeconds", "tumbling windows are not simulated"],
  ["StartingPosition", "SQS queues are the only simulated event source"],
  [
    "StartingPositionTimestamp",
    "SQS queues are the only simulated event source",
  ],
  ["Topics", "SQS queues are the only simulated event source"],
  ["Queues", "SQS queues are the only simulated event source"],
  ["SelfManagedEventSource", "SQS queues are the only simulated event source"],
  [
    "SelfManagedKafkaEventSourceConfig",
    "SQS queues are the only simulated event source",
  ],
  [
    "AmazonManagedKafkaEventSourceConfig",
    "SQS queues are the only simulated event source",
  ],
  [
    "DocumentDBEventSourceConfig",
    "SQS queues are the only simulated event source",
  ],
  [
    "SourceAccessConfigurations",
    "event source authentication is not simulated",
  ],
  ["MetricsConfig", "event source metrics are not simulated"],
  ["KMSKeyArn", "filter criteria encryption is not simulated"],
  ["Tags", "tags are not simulated"],
]);

/**
 * Refuse an input this simulation has no behaviour for.
 */
export function refuseUnsimulatedInput(
  input: SimCreateEventSourceMappingCommandInput,
): void {
  for (const [name, value] of Object.entries(input)) {
    const reason = unsimulatedInputs.get(name);

    if (value !== undefined && reason !== undefined) {
      throw new SimLambdaInvalidParameterValueException(
        `${name} on an event source mapping is not simulated: ${reason}`,
      );
    }
  }

  if (
    input.MaximumBatchingWindowInSeconds !== undefined &&
    input.MaximumBatchingWindowInSeconds !== 0
  ) {
    throw new SimLambdaInvalidParameterValueException(
      "MaximumBatchingWindowInSeconds on an event source mapping is only " +
        "simulated as 0: a partial batch is delivered as soon as anything is " +
        "on the queue, so a batching window would have nothing to wait for",
    );
  }
}

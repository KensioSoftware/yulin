import { simulatedEventSourcesDescription } from "../../event-source/sim-lambda-event-source-arn.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import type { SimCreateEventSourceMappingCommandInput } from "./event-source-mapping.command.js";

/**
 * The inputs no simulated event source has behaviour for, and why each is
 * refused.
 *
 * Every one of them changes what a function sees or when it sees it, so
 * accepting and ignoring one would let a test pass on behaviour the deployment
 * would not have.
 */
const unsimulatedInputs: ReadonlyMap<string, string> = new Map([
  ["FilterCriteria", "event filtering is not simulated"],
  ["ScalingConfig", "polling concurrency is not simulated"],
  ["ProvisionedPollerConfig", "polling concurrency is not simulated"],
  [
    "BisectBatchOnFunctionError",
    "batch bisection is not simulated, so a failing stream batch is retried " +
      "whole",
  ],
  [
    "ParallelizationFactor",
    "polling concurrency is not simulated, so each shard of a stream is read " +
      "by one reader",
  ],
  ["TumblingWindowInSeconds", "tumbling windows are not simulated"],
  [
    "SourceAccessConfigurations",
    "event source authentication is not simulated",
  ],
  ["MetricsConfig", "event source metrics are not simulated"],
  ["KMSKeyArn", "filter criteria encryption is not simulated"],
  ["Tags", "tags are not simulated"],
]);

/**
 * The inputs that only mean something for an event source this simulation does
 * not have.
 *
 * None of them is a thing that is missing from the sources here. Each one
 * configures a source the ARN dispatcher refuses outright, so naming one is a
 * request for a different kind of mapping rather than for a feature.
 *
 * `StartingPosition` is not among them, because whether a source has one is the
 * source's own rule: a stream is refused without it and a queue is refused with
 * it. The two failed-batch limits are left out for the same reason: a stream
 * mapping keeps them and a queue mapping is refused for naming one.
 */
const unsupportedEventSourceInputs: ReadonlySet<string> = new Set([
  "Topics",
  "Queues",
  "SelfManagedEventSource",
  "SelfManagedKafkaEventSourceConfig",
  "AmazonManagedKafkaEventSourceConfig",
  "DocumentDBEventSourceConfig",
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
        "on the event source, so a batching window would have nothing to " +
        "wait for",
    );
  }
}

/**
 * Refuse an input belonging to an event source this simulation does not have.
 */
export function refuseUnsupportedEventSourceInput(
  input: SimCreateEventSourceMappingCommandInput,
): void {
  for (const [name, value] of Object.entries(input)) {
    if (value !== undefined && unsupportedEventSourceInputs.has(name)) {
      throw new SimLambdaInvalidParameterValueException(
        `${name} on an event source mapping is for an event source this ` +
          `simulation does not have: ${simulatedEventSourcesDescription}`,
      );
    }
  }
}

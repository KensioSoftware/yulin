import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

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
const simulatedPropertyNames: ReadonlySet<string> = new Set([
  "BatchSize",
  "Enabled",
  "EventSourceArn",
  "FunctionName",
  "FunctionResponseTypes",
  "MaximumBatchingWindowInSeconds",
  "MaximumRecordAgeInSeconds",
  "MaximumRetryAttempts",
  "StartingPosition",
  "StartingPositionTimestamp",
]);

/**
 * Real AWS::Lambda::EventSourceMapping properties this simulation does not
 * model.
 *
 * Every one of them changes what the function sees or when it sees it, so a
 * template asking for one fails the Resource rather than deploying a mapping
 * that quietly ignores it.
 */
const unsimulatedPropertyNames: ReadonlySet<string> = new Set([
  "AmazonManagedKafkaEventSourceConfig",
  "BisectBatchOnFunctionError",
  "DestinationConfig",
  "DocumentDBEventSourceConfig",
  "FilterCriteria",
  "KmsKeyArn",
  "MetricsConfig",
  "ParallelizationFactor",
  "ProvisionedPollerConfig",
  "Queues",
  "ScalingConfig",
  "SelfManagedEventSource",
  "SelfManagedKafkaEventSourceConfig",
  "SourceAccessConfigurations",
  "Tags",
  "Topics",
  "TumblingWindowInSeconds",
]);

/**
 * Build the error a property of an AWS::Lambda::EventSourceMapping Resource is
 * refused with.
 *
 * The wording matters: sim CloudFormation skips a Resource whose error reads as
 * an unsupported Resource type, and skipping is the wrong answer for a mapping
 * that cannot be created as the template asks. The stack would deploy with the
 * queue and the function and nothing between them.
 */
export function eventSourceMappingPropertyError(
  logicalId: string,
  reason: string,
): Error {
  return new Error(
    `Invalid AWS::Lambda::EventSourceMapping Resource ${logicalId}: ${reason}`,
  );
}

/**
 * Refuse everything about an AWS::Lambda::EventSourceMapping Resource that is
 * not simulated.
 */
export function assertSimulatedEventSourceMappingProperties(
  logicalId: string,
  properties: SimCfnTemplateValueRecord,
): void {
  for (const name of Object.keys(properties)) {
    if (unsimulatedPropertyNames.has(name)) {
      throw eventSourceMappingPropertyError(
        logicalId,
        `${name} is a real AWS::Lambda::EventSourceMapping property that ` +
          "this simulation does not simulate, so it is refused rather than " +
          "ignored",
      );
    }

    if (!simulatedPropertyNames.has(name)) {
      throw eventSourceMappingPropertyError(
        logicalId,
        `${name} is not an AWS::Lambda::EventSourceMapping property`,
      );
    }
  }
}

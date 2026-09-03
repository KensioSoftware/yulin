import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
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
  "Topics",
  "TumblingWindowInSeconds",
]);

/**
 * Real AWS::Lambda::EventSourceMapping properties this simulation has nothing
 * to act on and no reason to fail a stack over.
 *
 * `Tags` is the whole list. The mapping is created without them and the
 * omission is recorded against the Resource. A mapping delivers the same
 * records with a tag and without one, and a CDK app calling
 * `Tags.of(app).add(...)` tags every mapping in it.
 */
const ignoredPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "Tags",
    "AWS::Lambda::EventSourceMapping property Tags is not simulated, so the " +
      "mapping is created without them. Nothing reads them back and nothing " +
      "is grouped or billed by them.",
  ],
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
 * not simulated, and record what the mapping is created without.
 */
export function assertSimulatedEventSourceMappingProperties(
  resource: SimCfnResource,
  properties: SimCfnTemplateValueRecord,
): void {
  const logicalId = resource.logicalId;

  for (const name of Object.keys(properties)) {
    const ignoredReason = ignoredPropertyReasons.get(name);

    if (ignoredReason !== undefined) {
      resource.ignoreProperty(name, ignoredReason);

      continue;
    }

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

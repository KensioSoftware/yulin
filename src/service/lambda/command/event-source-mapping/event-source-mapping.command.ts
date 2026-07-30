/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/CreateEventSourceMappingCommand/
 *
 * The event source mapping commands share their output shape, because every one
 * of them reports the mapping it acted on, so they share one module.
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaEventSourceMappingConfiguration } from "../../event-source/sim-lambda-event-source-mapping.js";

/**
 * Minimal structural sim Lambda event source mapping output.
 */
export interface SimEventSourceMappingCommandOutput extends SimLambdaEventSourceMappingConfiguration {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Lambda CreateEventSourceMapping command.
 */
export interface SimCreateEventSourceMappingCommand {
  readonly input: SimCreateEventSourceMappingCommandInput;
}

/**
 * Minimal structural sim Lambda CreateEventSourceMapping input.
 *
 * The inputs this simulation has no behaviour for are declared so a request
 * carrying one can be refused rather than silently ignored.
 */
export interface SimCreateEventSourceMappingCommandInput {
  readonly EventSourceArn?: string | undefined;
  readonly FunctionName?: string | undefined;
  readonly Enabled?: boolean | undefined;
  readonly BatchSize?: number | undefined;
  readonly MaximumBatchingWindowInSeconds?: number | undefined;
  readonly FunctionResponseTypes?: readonly string[] | undefined;
  readonly FilterCriteria?: object | undefined;
  readonly ScalingConfig?: object | undefined;
  readonly DestinationConfig?: object | undefined;
  readonly SelfManagedEventSource?: object | undefined;
  readonly SelfManagedKafkaEventSourceConfig?: object | undefined;
  readonly AmazonManagedKafkaEventSourceConfig?: object | undefined;
  readonly DocumentDBEventSourceConfig?: object | undefined;
  readonly SourceAccessConfigurations?: readonly object[] | undefined;
  readonly ProvisionedPollerConfig?: object | undefined;
  readonly MetricsConfig?: object | undefined;
  readonly StartingPosition?: string | undefined;
  readonly StartingPositionTimestamp?: Date | undefined;
  readonly Topics?: readonly string[] | undefined;
  readonly Queues?: readonly string[] | undefined;
  readonly MaximumRecordAgeInSeconds?: number | undefined;
  readonly MaximumRetryAttempts?: number | undefined;
  readonly ParallelizationFactor?: number | undefined;
  readonly TumblingWindowInSeconds?: number | undefined;
  readonly BisectBatchOnFunctionError?: boolean | undefined;
  readonly KMSKeyArn?: string | undefined;
  readonly Tags?: Record<string, string> | undefined;
}

export type SimCreateEventSourceMappingCommandOutput =
  SimEventSourceMappingCommandOutput;

/**
 * Minimal structural sim Lambda GetEventSourceMapping command.
 */
export interface SimGetEventSourceMappingCommand {
  readonly input: SimGetEventSourceMappingCommandInput;
}

export interface SimGetEventSourceMappingCommandInput {
  readonly UUID?: string | undefined;
}

export type SimGetEventSourceMappingCommandOutput =
  SimEventSourceMappingCommandOutput;

/**
 * Minimal structural sim Lambda DeleteEventSourceMapping command.
 */
export interface SimDeleteEventSourceMappingCommand {
  readonly input: SimDeleteEventSourceMappingCommandInput;
}

export interface SimDeleteEventSourceMappingCommandInput {
  readonly UUID?: string | undefined;
}

export type SimDeleteEventSourceMappingCommandOutput =
  SimEventSourceMappingCommandOutput;

/**
 * Minimal structural sim Lambda ListEventSourceMappings command.
 */
export interface SimListEventSourceMappingsCommand {
  readonly input: SimListEventSourceMappingsCommandInput;
}

export interface SimListEventSourceMappingsCommandInput {
  readonly EventSourceArn?: string | undefined;
  readonly FunctionName?: string | undefined;
}

export interface SimListEventSourceMappingsCommandOutput {
  readonly EventSourceMappings: readonly SimLambdaEventSourceMappingConfiguration[];
  readonly $metadata: SimResponseMetadata;
}

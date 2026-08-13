import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * One event bus as a listing reports it.
 */
export interface SimListedEventBus {
  readonly Name: string;
  readonly Arn: string;
  readonly Description?: string | undefined;
  readonly CreationTime: Date;
  readonly LastModifiedTime: Date;
}

/**
 * The dead letter queue configuration a bus request can carry, which this
 * simulation refuses rather than models.
 */
export interface SimEventBridgeDeadLetterConfig {
  readonly Arn?: string | undefined;
}

/**
 * The log configuration a bus request can carry, which this simulation refuses
 * rather than models.
 */
export interface SimEventBridgeLogConfig {
  readonly IncludeDetail?: string | undefined;
  readonly Level?: string | undefined;
}

/**
 * One tag as an event bus request carries it.
 */
export interface SimEventBridgeTag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * Minimal structural sim EventBridge CreateEventBus command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/CreateEventBusCommand/
 */
export interface SimCreateEventBusCommand {
  readonly input: SimCreateEventBusCommandInput;
}

export interface SimCreateEventBusCommandInput {
  readonly Name?: string | undefined;
  readonly Description?: string | undefined;
  readonly EventSourceName?: string | undefined;
  readonly KmsKeyIdentifier?: string | undefined;
  readonly DeadLetterConfig?: SimEventBridgeDeadLetterConfig | undefined;
  readonly LogConfig?: SimEventBridgeLogConfig | undefined;
  readonly Tags?: readonly SimEventBridgeTag[] | undefined;
}

export interface SimCreateEventBusCommandOutput {
  readonly EventBusArn?: string | undefined;
  readonly Description?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge DeleteEventBus command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/DeleteEventBusCommand/
 */
export interface SimDeleteEventBusCommand {
  readonly input: SimDeleteEventBusCommandInput;
}

export interface SimDeleteEventBusCommandInput {
  readonly Name?: string | undefined;
}

export interface SimDeleteEventBusCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge DescribeEventBus command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/DescribeEventBusCommand/
 */
export interface SimDescribeEventBusCommand {
  readonly input: SimDescribeEventBusCommandInput;
}

export interface SimDescribeEventBusCommandInput {
  readonly Name?: string | undefined;
}

export interface SimDescribeEventBusCommandOutput {
  readonly Name?: string | undefined;
  readonly Arn?: string | undefined;
  readonly Description?: string | undefined;
  readonly CreationTime?: Date | undefined;
  readonly LastModifiedTime?: Date | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim EventBridge ListEventBuses command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/ListEventBusesCommand/
 */
export interface SimListEventBusesCommand {
  readonly input: SimListEventBusesCommandInput;
}

export interface SimListEventBusesCommandInput {
  readonly NamePrefix?: string | undefined;
  readonly Limit?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListEventBusesCommandOutput {
  readonly EventBuses?: readonly SimListedEventBus[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

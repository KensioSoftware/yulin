import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim EventBridge DescribeEventSource command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/DescribeEventSourceCommand/
 */
export interface SimDescribeEventSourceCommand {
  readonly input: SimDescribeEventSourceCommandInput;
}

export interface SimDescribeEventSourceCommandInput {
  readonly Name?: string | undefined;
}

export interface SimDescribeEventSourceCommandOutput {
  readonly Arn?: string | undefined;
  readonly CreatedBy?: string | undefined;
  readonly CreationTime?: Date | undefined;
  readonly Name?: string | undefined;
  readonly State?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * One event as a partner's PutPartnerEvents request carries it.
 *
 * https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutPartnerEventsRequestEntry.html
 */
export interface SimPutPartnerEventsRequestEntry {
  readonly Source?: string | undefined;
  readonly DetailType?: string | undefined;
  readonly Detail?: string | undefined;
  readonly Resources?: readonly string[] | undefined;
  readonly Time?: Date | undefined;
}

/**
 * One partner entry's result, which carries either an event id or a failure.
 */
export interface SimPutPartnerEventsResultEntry {
  readonly EventId?: string | undefined;
  readonly ErrorCode?: string | undefined;
  readonly ErrorMessage?: string | undefined;
}

/**
 * Minimal structural sim EventBridge PutPartnerEvents command.
 *
 * A SaaS partner sends this from its own Account. In a simulation it is a
 * test acting as the partner, through `SimEventBridge.putPartnerEvents`.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/PutPartnerEventsCommand/
 */
export interface SimPutPartnerEventsCommand {
  readonly input: SimPutPartnerEventsCommandInput;
}

export interface SimPutPartnerEventsCommandInput {
  readonly Entries?: readonly SimPutPartnerEventsRequestEntry[] | undefined;
}

export interface SimPutPartnerEventsCommandOutput {
  readonly Entries?: readonly SimPutPartnerEventsResultEntry[] | undefined;
  readonly FailedEntryCount?: number | undefined;
  readonly $metadata: SimResponseMetadata;
}

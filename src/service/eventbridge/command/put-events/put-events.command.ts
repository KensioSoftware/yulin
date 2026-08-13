import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * One event as a PutEvents request carries it.
 *
 * Every field is optional in the API model, but `Detail`, `DetailType` and
 * `Source` are all required for EventBridge to take the entry, which is why an
 * entry missing one of them comes back as a failure rather than being refused
 * up front.
 *
 * https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEventsRequestEntry.html
 */
export interface SimPutEventsRequestEntry {
  readonly Source?: string | undefined;
  readonly DetailType?: string | undefined;
  readonly Detail?: string | undefined;
  readonly EventBusName?: string | undefined;
  readonly Resources?: readonly string[] | undefined;
  readonly Time?: Date | undefined;
  readonly TraceHeader?: string | undefined;
}

/**
 * One entry's result, which carries either an event id or a failure.
 */
export interface SimPutEventsResultEntry {
  readonly EventId?: string | undefined;
  readonly ErrorCode?: string | undefined;
  readonly ErrorMessage?: string | undefined;
}

/**
 * Minimal structural sim EventBridge PutEvents command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/eventbridge/command/PutEventsCommand/
 */
export interface SimPutEventsCommand {
  readonly input: SimPutEventsCommandInput;
}

export interface SimPutEventsCommandInput {
  readonly Entries?: readonly SimPutEventsRequestEntry[] | undefined;
  readonly EndpointId?: string | undefined;
}

export interface SimPutEventsCommandOutput {
  readonly Entries?: readonly SimPutEventsResultEntry[] | undefined;
  readonly FailedEntryCount?: number | undefined;
  readonly $metadata: SimResponseMetadata;
}

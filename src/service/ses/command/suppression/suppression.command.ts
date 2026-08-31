import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * What a suppression list entry says, in the shape the SES v2 API reports it.
 *
 * `Attributes` is left out. Real SES uses it for details of the feedback event
 * that put the address on the list. Explicit simulator feedback records the
 * reason and time only.
 */
export interface SimSesSuppressedDestinationDetail {
  readonly EmailAddress: string;
  readonly Reason: string;
  readonly LastUpdateTime: Date;
}

/**
 * What ListSuppressedDestinations reports about one address, which is the same
 * three fields.
 */
export interface SimSesSuppressedDestinationSummary {
  readonly EmailAddress: string;
  readonly Reason: string;
  readonly LastUpdateTime: Date;
}

/**
 * Minimal structural sim SES v2 PutSuppressedDestination command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/PutSuppressedDestinationCommand/
 */
export interface SimPutSuppressedDestinationCommand {
  readonly input: SimPutSuppressedDestinationCommandInput;
}

export interface SimPutSuppressedDestinationCommandInput {
  readonly EmailAddress?: string | undefined;
  readonly Reason?: string | undefined;
  readonly TenantName?: string | undefined;
}

export interface SimPutSuppressedDestinationCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 GetSuppressedDestination command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/GetSuppressedDestinationCommand/
 */
export interface SimGetSuppressedDestinationCommand {
  readonly input: SimGetSuppressedDestinationCommandInput;
}

export interface SimGetSuppressedDestinationCommandInput {
  readonly EmailAddress?: string | undefined;
  readonly TenantName?: string | undefined;
}

export interface SimGetSuppressedDestinationCommandOutput {
  readonly SuppressedDestination?: SimSesSuppressedDestinationDetail;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 ListSuppressedDestinations command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/ListSuppressedDestinationsCommand/
 */
export interface SimListSuppressedDestinationsCommand {
  readonly input?: SimListSuppressedDestinationsCommandInput | undefined;
}

export interface SimListSuppressedDestinationsCommandInput {
  readonly Reasons?: readonly string[] | undefined;
  readonly StartDate?: Date | undefined;
  readonly EndDate?: Date | undefined;
  readonly NextToken?: string | undefined;
  readonly PageSize?: number | undefined;
  readonly TenantName?: string | undefined;
}

export interface SimListSuppressedDestinationsCommandOutput {
  readonly SuppressedDestinationSummaries?: readonly SimSesSuppressedDestinationSummary[];
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 DeleteSuppressedDestination command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/DeleteSuppressedDestinationCommand/
 */
export interface SimDeleteSuppressedDestinationCommand {
  readonly input: SimDeleteSuppressedDestinationCommandInput;
}

export interface SimDeleteSuppressedDestinationCommandInput {
  readonly EmailAddress?: string | undefined;
  readonly TenantName?: string | undefined;
}

export interface SimDeleteSuppressedDestinationCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

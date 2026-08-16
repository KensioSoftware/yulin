import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * The verification states real SES reports, of which this simulator produces
 * two: an identity is pending until something says it is verified.
 */
export type SimSesVerificationStatusValue =
  | "FAILED"
  | "NOT_STARTED"
  | "PENDING"
  | "SUCCESS"
  | "TEMPORARY_FAILURE";

/**
 * Minimal structural sim SES v2 CreateEmailIdentity command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/CreateEmailIdentityCommand/
 */
export interface SimCreateEmailIdentityCommand {
  readonly input: SimCreateEmailIdentityCommandInput;
}

export interface SimCreateEmailIdentityCommandInput {
  readonly EmailIdentity?: string | undefined;
  readonly Tags?: readonly unknown[] | undefined;
  readonly DkimSigningAttributes?: unknown;
  readonly ConfigurationSetName?: string | undefined;
}

export interface SimCreateEmailIdentityCommandOutput {
  readonly IdentityType?: string | undefined;
  readonly VerifiedForSendingStatus?: boolean | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 GetEmailIdentity command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/GetEmailIdentityCommand/
 */
export interface SimGetEmailIdentityCommand {
  readonly input: SimGetEmailIdentityCommandInput;
}

export interface SimGetEmailIdentityCommandInput {
  readonly EmailIdentity?: string | undefined;
}

export interface SimGetEmailIdentityCommandOutput {
  readonly IdentityType?: string | undefined;
  readonly VerifiedForSendingStatus?: boolean | undefined;
  readonly VerificationStatus?: SimSesVerificationStatusValue | undefined;
  readonly FeedbackForwardingStatus?: boolean | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 DeleteEmailIdentity command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/DeleteEmailIdentityCommand/
 */
export interface SimDeleteEmailIdentityCommand {
  readonly input: SimDeleteEmailIdentityCommandInput;
}

export interface SimDeleteEmailIdentityCommandInput {
  readonly EmailIdentity?: string | undefined;
}

export interface SimDeleteEmailIdentityCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 ListEmailIdentities command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/ListEmailIdentitiesCommand/
 */
export interface SimListEmailIdentitiesCommand {
  readonly input: SimListEmailIdentitiesCommandInput;
}

export interface SimListEmailIdentitiesCommandInput {
  readonly PageSize?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListEmailIdentitiesCommandOutput {
  readonly EmailIdentities?: readonly SimSesIdentityInfo[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * What ListEmailIdentities reports about one identity.
 */
export interface SimSesIdentityInfo {
  readonly IdentityType: string;
  readonly IdentityName: string;
  readonly SendingEnabled: boolean;
  readonly VerificationStatus: SimSesVerificationStatusValue;
}

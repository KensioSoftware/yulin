import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim SES v2 GetAccount command.
 *
 * GetAccount takes no input at all, so its `input` is only here because every
 * SDK Command has one.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/GetAccountCommand/
 */
export interface SimGetAccountCommand {
  readonly input?: object | undefined;
}

export interface SimSesSendQuotaDetail {
  readonly Max24HourSend: number;
  readonly MaxSendRate: number;
  readonly SentLast24Hours: number;
}

export interface SimGetAccountCommandOutput {
  readonly DedicatedIpAutoWarmupEnabled?: boolean | undefined;
  readonly EnforcementStatus?: string | undefined;
  readonly ProductionAccessEnabled?: boolean | undefined;
  readonly SendQuota?: SimSesSendQuotaDetail | undefined;
  readonly SendingEnabled?: boolean | undefined;
  readonly SuppressionAttributes?: SimSesSuppressionAttributes | undefined;
  readonly Details?: SimSesAccountDetailsOutput | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * The reasons an account holds addresses back for, as GetAccount reports them
 * and PutAccountSuppressionAttributes sets them.
 */
export interface SimSesSuppressionAttributes {
  readonly SuppressedReasons?: readonly string[] | undefined;
}

/**
 * What GetAccount reports back of the details PutAccountDetails was given.
 */
export interface SimSesAccountDetailsOutput {
  readonly MailType?: string | undefined;
  readonly WebsiteURL?: string | undefined;
  readonly ContactLanguage?: string | undefined;
  readonly UseCaseDescription?: string | undefined;
  readonly AdditionalContactEmailAddresses?: readonly string[] | undefined;
  readonly ReviewDetails?: { readonly Status?: string | undefined } | undefined;
}

/**
 * Minimal structural sim SES v2 PutAccountDetails command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/PutAccountDetailsCommand/
 */
export interface SimPutAccountDetailsCommand {
  readonly input: SimPutAccountDetailsCommandInput;
}

export interface SimPutAccountDetailsCommandInput {
  readonly MailType?: string | undefined;
  readonly WebsiteURL?: string | undefined;
  readonly ContactLanguage?: string | undefined;
  readonly UseCaseDescription?: string | undefined;
  readonly AdditionalContactEmailAddresses?: readonly string[] | undefined;
  readonly ProductionAccessEnabled?: boolean | undefined;
}

export interface SimPutAccountDetailsCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 PutAccountSuppressionAttributes command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/PutAccountSuppressionAttributesCommand/
 */
export interface SimPutAccountSuppressionAttributesCommand {
  readonly input?: SimPutAccountSuppressionAttributesCommandInput | undefined;
}

export interface SimPutAccountSuppressionAttributesCommandInput {
  readonly SuppressedReasons?: readonly string[] | undefined;
}

export interface SimPutAccountSuppressionAttributesCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

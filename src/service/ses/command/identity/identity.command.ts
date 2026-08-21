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
  readonly Tags?: readonly SimSesTagInput[] | undefined;
  readonly DkimSigningAttributes?: SimSesDkimSigningAttributes | undefined;
  readonly ConfigurationSetName?: string | undefined;
}

/**
 * One tag as a request carries it, with both halves optional.
 *
 * The SDK's own `Tag` says the same, so a request holding half a tag typechecks
 * on the way in and is dropped on the way through.
 */
export interface SimSesTagInput {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * The Bring Your Own DKIM inputs, and the key length Easy DKIM rotates to.
 *
 * `DomainSigningPrivateKey` is read off the request and dropped. Nothing here
 * signs a message, so keeping the key would mean holding a secret this
 * simulation has no use for.
 */
export interface SimSesDkimSigningAttributes {
  readonly DomainSigningSelector?: string | undefined;
  readonly DomainSigningPrivateKey?: string | undefined;
  readonly NextSigningKeyLength?: string | undefined;
}

/** One tag, in the shape SES and CloudFormation both use. */
export interface SimSesTag {
  readonly Key: string;
  readonly Value: string;
}

export interface SimCreateEmailIdentityCommandOutput {
  readonly IdentityType?: string | undefined;
  readonly VerifiedForSendingStatus?: boolean | undefined;
  readonly DkimAttributes?: SimSesDkimAttributes | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * What SES reports about an identity's DKIM signing.
 *
 * `Tokens` are the three names Easy DKIM publishes CNAME records under. They
 * are made up here, deterministically from the identity's own name, and no
 * message is signed with anything.
 */
export interface SimSesDkimAttributes {
  readonly SigningEnabled?: boolean | undefined;
  readonly Status?: SimSesDkimStatusValue | undefined;
  readonly Tokens?: readonly string[] | undefined;
  readonly SigningAttributesOrigin?: string | undefined;
  readonly NextSigningKeyLength?: string | undefined;
}

export type SimSesDkimStatusValue =
  | SimSesVerificationStatusValue
  | "NOT_STARTED";

/** What SES reports about an identity's custom envelope sender domain. */
export interface SimSesMailFromAttributes {
  readonly MailFromDomain?: string | undefined;
  readonly MailFromDomainStatus?: SimSesVerificationStatusValue | undefined;
  readonly BehaviorOnMxFailure?: string | undefined;
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
  readonly DkimAttributes?: SimSesDkimAttributes | undefined;
  readonly MailFromAttributes?: SimSesMailFromAttributes | undefined;
  readonly ConfigurationSetName?: string | undefined;
  readonly Tags?: readonly SimSesTag[] | undefined;
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

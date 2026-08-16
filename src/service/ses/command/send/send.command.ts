import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * One part of a message: its subject line, or one representation of its body.
 */
export interface SimSesContent {
  readonly Data?: string | undefined;
  readonly Charset?: string | undefined;
}

export interface SimSesBody {
  readonly Text?: SimSesContent | undefined;
  readonly Html?: SimSesContent | undefined;
}

export interface SimSesMessage {
  readonly Subject?: SimSesContent | undefined;
  readonly Body?: SimSesBody | undefined;
  readonly Headers?: readonly unknown[] | undefined;
  readonly Attachments?: readonly unknown[] | undefined;
}

export interface SimSesRawMessage {
  readonly Data?: Uint8Array | string | undefined;
}

/**
 * The template branch of a message, which this issue's scope does not render.
 *
 * It is typed here so a send carrying one can be told apart from a malformed
 * request and refused with a message saying so.
 */
export interface SimSesTemplate {
  readonly TemplateName?: string | undefined;
  readonly TemplateArn?: string | undefined;
  readonly TemplateData?: string | undefined;
}

export interface SimSesEmailContent {
  readonly Simple?: SimSesMessage | undefined;
  readonly Raw?: SimSesRawMessage | undefined;
  readonly Template?: SimSesTemplate | undefined;
}

export interface SimSesDestination {
  readonly ToAddresses?: readonly string[] | undefined;
  readonly CcAddresses?: readonly string[] | undefined;
  readonly BccAddresses?: readonly string[] | undefined;
}

/**
 * Minimal structural sim SES v2 SendEmail command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/SendEmailCommand/
 */
export interface SimSendEmailCommand {
  readonly input: SimSendEmailCommandInput;
}

export interface SimSendEmailCommandInput {
  readonly FromEmailAddress?: string | undefined;
  readonly FromEmailAddressIdentityArn?: string | undefined;
  readonly Destination?: SimSesDestination | undefined;
  readonly ReplyToAddresses?: readonly string[] | undefined;
  readonly FeedbackForwardingEmailAddress?: string | undefined;
  readonly Content?: SimSesEmailContent | undefined;
  readonly EmailTags?: readonly unknown[] | undefined;
  readonly ConfigurationSetName?: string | undefined;
  readonly ListManagementOptions?: unknown;
}

export interface SimSendEmailCommandOutput {
  readonly MessageId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

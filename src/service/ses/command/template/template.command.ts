import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * The wording of a template, as the SES v2 API carries it.
 */
export interface SimSesEmailTemplateContent {
  readonly Subject?: string | undefined;
  readonly Text?: string | undefined;
  readonly Html?: string | undefined;
}

/**
 * Minimal structural sim SES v2 CreateEmailTemplate command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/CreateEmailTemplateCommand/
 */
export interface SimCreateEmailTemplateCommand {
  readonly input: SimCreateEmailTemplateCommandInput;
}

export interface SimCreateEmailTemplateCommandInput {
  readonly TemplateName?: string | undefined;
  readonly TemplateContent?: SimSesEmailTemplateContent | undefined;
  readonly Tags?: readonly unknown[] | undefined;
}

export interface SimCreateEmailTemplateCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 GetEmailTemplate command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/GetEmailTemplateCommand/
 */
export interface SimGetEmailTemplateCommand {
  readonly input: SimGetEmailTemplateCommandInput;
}

export interface SimGetEmailTemplateCommandInput {
  readonly TemplateName?: string | undefined;
}

export interface SimGetEmailTemplateCommandOutput {
  readonly TemplateName?: string | undefined;
  readonly TemplateContent?: SimSesEmailTemplateContent | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 UpdateEmailTemplate command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/UpdateEmailTemplateCommand/
 */
export interface SimUpdateEmailTemplateCommand {
  readonly input: SimUpdateEmailTemplateCommandInput;
}

export interface SimUpdateEmailTemplateCommandInput {
  readonly TemplateName?: string | undefined;
  readonly TemplateContent?: SimSesEmailTemplateContent | undefined;
}

export interface SimUpdateEmailTemplateCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 DeleteEmailTemplate command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/DeleteEmailTemplateCommand/
 */
export interface SimDeleteEmailTemplateCommand {
  readonly input: SimDeleteEmailTemplateCommandInput;
}

export interface SimDeleteEmailTemplateCommandInput {
  readonly TemplateName?: string | undefined;
}

export interface SimDeleteEmailTemplateCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim SES v2 ListEmailTemplates command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sesv2/command/ListEmailTemplatesCommand/
 */
export interface SimListEmailTemplatesCommand {
  readonly input: SimListEmailTemplatesCommandInput;
}

export interface SimListEmailTemplatesCommandInput {
  readonly PageSize?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListEmailTemplatesCommandOutput {
  readonly TemplatesMetadata?: readonly SimSesTemplateMetadata[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * What ListEmailTemplates reports about one template.
 *
 * Only the name and the time it was made: the wording is not listed, and has
 * to be read one template at a time with GetEmailTemplate.
 */
export interface SimSesTemplateMetadata {
  readonly TemplateName: string;
  readonly CreatedTimestamp: Date;
}

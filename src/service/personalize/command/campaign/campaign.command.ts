import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Personalize CreateCampaign command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/CreateCampaignCommand/
 */
export interface SimCreateCampaignCommand {
  readonly input: SimCreateCampaignCommandInput;
}

export interface SimCreateCampaignCommandInput {
  readonly name?: string | undefined;
  readonly solutionVersionArn?: string | undefined;
  readonly minProvisionedTPS?: number | undefined;
}

export interface SimCreateCampaignCommandOutput {
  readonly campaignArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * A campaign as Describe reports it.
 */
export interface SimPersonalizeCampaignDetail {
  readonly name?: string | undefined;
  readonly campaignArn?: string | undefined;
  readonly solutionVersionArn?: string | undefined;
  readonly minProvisionedTPS?: number | undefined;
  readonly status?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
}

/**
 * Minimal structural sim Personalize DescribeCampaign command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DescribeCampaignCommand/
 */
export interface SimDescribeCampaignCommand {
  readonly input: SimDescribeCampaignCommandInput;
}

export interface SimDescribeCampaignCommandInput {
  readonly campaignArn?: string | undefined;
}

export interface SimDescribeCampaignCommandOutput {
  readonly campaign?: SimPersonalizeCampaignDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * A campaign as List reports it.
 */
export interface SimPersonalizeCampaignSummary {
  readonly name?: string | undefined;
  readonly campaignArn?: string | undefined;
  readonly status?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
}

/**
 * Minimal structural sim Personalize ListCampaigns command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/ListCampaignsCommand/
 */
export interface SimListCampaignsCommand {
  readonly input?: SimListCampaignsCommandInput | undefined;
}

export interface SimListCampaignsCommandInput {
  readonly solutionArn?: string | undefined;
  readonly nextToken?: string | undefined;
  readonly maxResults?: number | undefined;
}

export interface SimListCampaignsCommandOutput {
  readonly campaigns?: readonly SimPersonalizeCampaignSummary[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize DeleteCampaign command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DeleteCampaignCommand/
 */
export interface SimDeleteCampaignCommand {
  readonly input: SimDeleteCampaignCommandInput;
}

export interface SimDeleteCampaignCommandInput {
  readonly campaignArn?: string | undefined;
}

export interface SimDeleteCampaignCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

import type {
  SimPersonalizeCampaignDetail,
  SimPersonalizeCampaignSummary,
} from "../command/campaign/campaign.command.js";
import type { SimPersonalizeCampaign } from "../resource/sim-personalize-campaign.js";

/**
 * A campaign as Describe reports it.
 */
export function simPersonalizeCampaignDetail(
  campaign: SimPersonalizeCampaign,
): SimPersonalizeCampaignDetail {
  return {
    ...simPersonalizeCampaignSummary(campaign),
    solutionVersionArn: campaign.solutionVersionArn,
    minProvisionedTPS: campaign.minProvisionedTPS,
  };
}

/**
 * A campaign as List reports it.
 */
export function simPersonalizeCampaignSummary(
  campaign: SimPersonalizeCampaign,
): SimPersonalizeCampaignSummary {
  return {
    name: campaign.name,
    campaignArn: campaign.arn,
    status: campaign.status,
    creationDateTime: campaign.creationDateTime,
    lastUpdatedDateTime: campaign.lastUpdatedDateTime,
  };
}

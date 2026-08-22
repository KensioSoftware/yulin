import type { SimPersonalizeCampaignRules } from "../../recommendation/sim-personalize-campaign-rules.js";
import type { SimPersonalizeCampaign } from "../../resource/sim-personalize-campaign.js";
import {
  SimPersonalizeCommandGroup,
  type SimPersonalizeCommandGroupProperties,
} from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";

export interface SimPersonalizeRuntimeCommandGroupProperties extends SimPersonalizeCommandGroupProperties {
  readonly rules: SimPersonalizeCampaignRules;
}

/**
 * What both simulated Personalize Runtime command handlers are built over.
 *
 * A runtime request names a campaign and is answered from what is declared
 * against that campaign, so both handlers reach a campaign the same way and
 * both read the same rules.
 */
export abstract class SimPersonalizeRuntimeCommandGroup extends SimPersonalizeCommandGroup {
  protected readonly rules: SimPersonalizeCampaignRules;

  constructor(properties: SimPersonalizeRuntimeCommandGroupProperties) {
    super(properties);
    this.rules = properties.rules;
  }

  /**
   * Read the campaign a runtime request names, authorizing against it first.
   *
   * A campaign ARN naming nothing is a missing resource, which is what real
   * Personalize Runtime calls it too.
   */
  protected campaign(
    campaignArn: string | undefined,
    action: string,
    options: SimPersonalizeRequestOptions | undefined,
  ): SimPersonalizeCampaign {
    return this.resolve(this.resources.campaigns, campaignArn, action, options);
  }
}

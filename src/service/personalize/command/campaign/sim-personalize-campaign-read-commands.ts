import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import { simPersonalizePageOf } from "../list/sim-personalize-page.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import {
  simPersonalizeCampaignDetail,
  simPersonalizeCampaignSummary,
} from "../../view/sim-personalize-campaign-view.js";
import type {
  SimDescribeCampaignCommand,
  SimDescribeCampaignCommandOutput,
  SimListCampaignsCommand,
  SimListCampaignsCommandOutput,
} from "./campaign.command.js";

/**
 * The simulated Personalize campaign commands that only read.
 */
export class SimPersonalizeCampaignReadCommands extends SimPersonalizeCommandGroup {
  /** Handle a DescribeCampaign command. */
  describe(
    command: SimDescribeCampaignCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDescribeCampaignCommandOutput {
    const campaign = this.resolve(
      this.resources.campaigns,
      command.input.campaignArn,
      "personalize:DescribeCampaign",
      options,
    );

    return { campaign: simPersonalizeCampaignDetail(campaign), $metadata: {} };
  }

  /**
   * Handle a ListCampaigns command.
   *
   * Real Personalize filters by solution rather than by solution version, so a
   * campaign matches when the version it deploys belongs to that solution.
   */
  list(
    command: SimListCampaignsCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimListCampaignsCommandOutput {
    this.authorizer.authorize("personalize:ListCampaigns", options);

    const solutionArn = command.input?.solutionArn;
    const matching = this.resources.campaigns.all.filter(
      (campaign) =>
        solutionArn === undefined ||
        this.resources.solutionVersions.find(campaign.solutionVersionArn)
          ?.solutionArn === solutionArn,
    );
    const page = simPersonalizePageOf(matching, command.input);

    return {
      campaigns: page.items.map((campaign) =>
        simPersonalizeCampaignSummary(campaign),
      ),
      nextToken: page.nextToken,
      $metadata: {},
    };
  }
}

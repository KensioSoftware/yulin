import { SimPersonalizeDeclarationError } from "../error/sim-personalize.error.js";
import type { SimPersonalizeCampaign } from "../resource/sim-personalize-campaign.js";
import type { SimPersonalizeResourceStore } from "../resource/sim-personalize-resource-store.js";

/**
 * Read the campaign a result is declared against, refusing an ARN no campaign
 * is deployed at.
 *
 * The refusal is what makes a mistyped ARN visible. A declaration left against
 * an ARN nothing holds would go unanswered, and the empty item list the runtime
 * came back with would read as the system under test asking for the wrong item.
 */
export function requireSimPersonalizeDeclaredCampaign(
  campaigns: SimPersonalizeResourceStore<SimPersonalizeCampaign>,
  campaignArn: string,
): SimPersonalizeCampaign {
  const campaign = campaigns.find(campaignArn);

  if (campaign === undefined) {
    throw new SimPersonalizeDeclarationError(
      `No simulated Personalize campaign is deployed at '${campaignArn}'. ` +
        `Results are declared against the campaign a runtime call names, so ` +
        `the campaign is created first.`,
    );
  }

  return campaign;
}

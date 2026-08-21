import { SimPersonalizeInvalidInputException } from "../../error/sim-personalize.error.js";
import { simPersonalizeCampaignArn } from "../../resource/sim-personalize-arn.js";
import { SimPersonalizeCampaign } from "../../resource/sim-personalize-campaign.js";
import { requireSimPersonalizeName } from "../../resource/sim-personalize-name.js";
import { simPersonalizeActiveStatus } from "../../resource/sim-personalize-status.js";
import { SimPersonalizeCommandGroup } from "../sim-personalize-command-group.js";
import type { SimPersonalizeRequestOptions } from "../sim-personalize-request-options.js";
import type {
  SimCreateCampaignCommand,
  SimCreateCampaignCommandOutput,
  SimDeleteCampaignCommand,
  SimDeleteCampaignCommandOutput,
} from "./campaign.command.js";

/**
 * The simulated Personalize campaign commands that change state.
 *
 * The campaign is what the whole custom chain exists to reach, and the one
 * resource no CloudFormation template can declare. Real AWS has no
 * `AWS::Personalize::Campaign` type either.
 */
export class SimPersonalizeCampaignWriteCommands extends SimPersonalizeCommandGroup {
  /** Handle a CreateCampaign command. */
  create(
    command: SimCreateCampaignCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimCreateCampaignCommandOutput {
    this.authorizer.authorize("personalize:CreateCampaign", options);

    const { input } = command;
    const name = requireSimPersonalizeName(input.name, "campaign");
    const version = this.resources.solutionVersions.require(
      input.solutionVersionArn,
    );
    const minProvisionedTPS = readMinProvisionedTPS(input.minProvisionedTPS);

    this.resources.campaigns.requireNameAvailable(name);

    const campaign = new SimPersonalizeCampaign({
      arn: simPersonalizeCampaignArn(name, this.accountRegionScope),
      name,
      status: simPersonalizeActiveStatus,
      creationDateTime: this.clock.now(),
      solutionVersionArn: version.arn,
      minProvisionedTPS,
    });

    this.resources.campaigns.add(campaign);

    return { campaignArn: campaign.arn, $metadata: {} };
  }

  /** Handle a DeleteCampaign command. */
  delete(
    command: SimDeleteCampaignCommand,
    options?: SimPersonalizeRequestOptions,
  ): SimDeleteCampaignCommandOutput {
    this.resources.campaigns.remove(
      this.resolve(
        this.resources.campaigns,
        command.input.campaignArn,
        "personalize:DeleteCampaign",
        options,
      ),
    );

    return { $metadata: {} };
  }
}

/**
 * Read the provisioned throughput, refusing a value below the one campaign
 * real Personalize always keeps running.
 */
function readMinProvisionedTPS(
  minProvisionedTPS: number | undefined,
): number | undefined {
  if (
    minProvisionedTPS !== undefined &&
    (!Number.isSafeInteger(minProvisionedTPS) || minProvisionedTPS < 1)
  ) {
    throw new SimPersonalizeInvalidInputException(
      "minProvisionedTPS must be a whole number of at least 1",
    );
  }

  return minProvisionedTPS;
}

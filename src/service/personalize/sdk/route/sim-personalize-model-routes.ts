import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
} from "../../../../sdk/index.js";
import type {
  SimCreateCampaignCommand,
  SimDeleteCampaignCommand,
  SimDescribeCampaignCommand,
  SimListCampaignsCommand,
} from "../../command/campaign/campaign.command.js";
import type {
  SimCreateRecommenderCommand,
  SimDeleteRecommenderCommand,
  SimDescribeRecommenderCommand,
  SimListRecommendersCommand,
  SimStartRecommenderCommand,
  SimStopRecommenderCommand,
  SimUpdateRecommenderCommand,
} from "../../command/recommender/recommender.command.js";
import type {
  SimCreateSolutionCommand,
  SimCreateSolutionVersionCommand,
  SimDeleteSolutionCommand,
  SimDescribeSolutionCommand,
  SimDescribeSolutionVersionCommand,
  SimListSolutionVersionsCommand,
  SimListSolutionsCommand,
} from "../../command/solution/solution.command.js";
import type { SimPersonalize } from "../../sim-personalize.js";

/**
 * The SDK routes for the model side of the Personalize control plane.
 *
 * Solutions, solution versions and campaigns are the custom path.
 * Recommenders are the domain path's answer to all three, and they sit here
 * because that is where `SimPersonalizeControlPlane` puts them.
 */
export function simPersonalizeModelRoutes(
  simPersonalize: SimPersonalize,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  const routes: (readonly [string, SimSdkCommandRoute])[] = [
    [
      "CreateSolutionCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.createSolution(
          command as SimCreateSolutionCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DescribeSolutionCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.describeSolution(
          command as SimDescribeSolutionCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListSolutionsCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.listSolutions(
          command as SimListSolutionsCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteSolutionCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.deleteSolution(
          command as SimDeleteSolutionCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "CreateSolutionVersionCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.createSolutionVersion(
          command as SimCreateSolutionVersionCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DescribeSolutionVersionCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.describeSolutionVersion(
          command as SimDescribeSolutionVersionCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListSolutionVersionsCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.listSolutionVersions(
          command as SimListSolutionVersionsCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "CreateCampaignCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.createCampaign(
          command as SimCreateCampaignCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DescribeCampaignCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.describeCampaign(
          command as SimDescribeCampaignCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListCampaignsCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.listCampaigns(
          command as SimListCampaignsCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteCampaignCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.deleteCampaign(
          command as SimDeleteCampaignCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "CreateRecommenderCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.createRecommender(
          command as SimCreateRecommenderCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DescribeRecommenderCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.describeRecommender(
          command as SimDescribeRecommenderCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListRecommendersCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.listRecommenders(
          command as SimListRecommendersCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "UpdateRecommenderCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.updateRecommender(
          command as SimUpdateRecommenderCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteRecommenderCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.deleteRecommender(
          command as SimDeleteRecommenderCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "StartRecommenderCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.startRecommender(
          command as SimStartRecommenderCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "StopRecommenderCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.stopRecommender(
          command as SimStopRecommenderCommand,
          simSdkCallerOptions(context),
        ),
    ],
  ];

  return routes;
}

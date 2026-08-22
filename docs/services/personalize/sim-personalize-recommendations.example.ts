/**
 * Answering a related items request from declared recommendations.
 */

import {
  CreateCampaignCommand,
  CreateDatasetGroupCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
} from "@aws-sdk/client-personalize";
import { GetRecommendationsCommand } from "@aws-sdk/client-personalize-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const group = await simAws
  .personalize()
  .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));
const solution = await simAws.personalize().createSolution(
  new CreateSolutionCommand({
    name: "related-entries",
    datasetGroupArn: group.datasetGroupArn,
    recipeArn: "arn:aws:personalize:::recipe/aws-similar-items",
  }),
);
const version = await simAws
  .personalize()
  .createSolutionVersion(
    new CreateSolutionVersionCommand({ solutionArn: solution.solutionArn }),
  );
const campaign = await simAws.personalize().createCampaign(
  new CreateCampaignCommand({
    name: "related-entries",
    solutionVersionArn: version.solutionVersionArn,
  }),
);

const campaignArn = campaign.campaignArn!;

// What this campaign recommends for one entry.
simAws
  .personalize()
  .recommendations(campaignArn)
  .onItem("entry-1042", { itemIds: ["entry-2071", "entry-3388"] });

const recommended = await simAws.personalizeRuntime().getRecommendations(
  new GetRecommendationsCommand({
    campaignArn,
    itemId: "entry-1042",
    numResults: 2,
  }),
);

// entry-2071 entry-3388
console.log(recommended.itemList?.map((item) => item.itemId).join(" "));

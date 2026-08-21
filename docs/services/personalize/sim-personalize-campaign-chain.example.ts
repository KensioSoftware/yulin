/**
 * Walking the custom chain from a dataset group to a campaign.
 */

import {
  CreateCampaignCommand,
  CreateDatasetGroupCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
  DescribeCampaignCommand,
} from "@aws-sdk/client-personalize";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const group = await simAws
  .personalize()
  .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));

const solution = await simAws.personalize().createSolution(
  new CreateSolutionCommand({
    name: "related-items",
    datasetGroupArn: group.datasetGroupArn,
    recipeArn: "arn:aws:personalize:::recipe/aws-similar-items",
  }),
);

// Real Personalize trains for tens of minutes here and reports CREATE PENDING
// until it finishes. This one is ACTIVE immediately, with nothing to poll.
const version = await simAws
  .personalize()
  .createSolutionVersion(
    new CreateSolutionVersionCommand({ solutionArn: solution.solutionArn }),
  );

const campaign = await simAws.personalize().createCampaign(
  new CreateCampaignCommand({
    name: "related-items",
    solutionVersionArn: version.solutionVersionArn,
  }),
);

const described = await simAws
  .personalize()
  .describeCampaign(
    new DescribeCampaignCommand({ campaignArn: campaign.campaignArn }),
  );

// ACTIVE 1
console.log(described.campaign?.status, described.campaign?.minProvisionedTPS);

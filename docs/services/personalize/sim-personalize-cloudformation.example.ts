/**
 * Deploying a Personalize dataset group, schema, dataset and solution.
 */

import {
  CreateCampaignCommand,
  CreateSolutionVersionCommand,
} from "@aws-sdk/client-personalize";
import { GetRecommendationsCommand } from "@aws-sdk/client-personalize-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "catalogue",
  template: {
    Resources: {
      Catalogue: {
        Type: "AWS::Personalize::DatasetGroup",
        Properties: { Name: "catalogue" },
      },
      InteractionsSchema: {
        Type: "AWS::Personalize::Schema",
        Properties: {
          Name: "interactions",
          Schema: JSON.stringify({
            type: "record",
            name: "Interactions",
            fields: [
              { name: "USER_ID", type: "string" },
              { name: "ITEM_ID", type: "string" },
              { name: "TIMESTAMP", type: "long" },
            ],
          }),
        },
      },
      Views: {
        Type: "AWS::Personalize::Dataset",
        Properties: {
          Name: "views",
          DatasetType: "Interactions",
          DatasetGroupArn: { "Fn::GetAtt": ["Catalogue", "DatasetGroupArn"] },
          SchemaArn: { "Fn::GetAtt": ["InteractionsSchema", "SchemaArn"] },
        },
      },
      RelatedItems: {
        Type: "AWS::Personalize::Solution",
        Properties: {
          Name: "related-items",
          DatasetGroupArn: { "Fn::GetAtt": ["Catalogue", "DatasetGroupArn"] },
          RecipeArn: "arn:aws:personalize:::recipe/aws-similar-items",
        },
      },
    },
    Outputs: {
      SolutionArn: { Value: { "Fn::GetAtt": ["RelatedItems", "SolutionArn"] } },
    },
  },
});

// The stack stops at the solution. The version and the campaign are created
// here, the way they are created outside a template on AWS.
const version = await simAws.personalize().createSolutionVersion(
  new CreateSolutionVersionCommand({
    solutionArn: stack.outputs.get("SolutionArn")!.value as string,
  }),
);

const campaign = await simAws.personalize().createCampaign(
  new CreateCampaignCommand({
    name: "related-items",
    solutionVersionArn: version.solutionVersionArn,
  }),
);

const campaignArn = campaign.campaignArn!;

simAws
  .personalize()
  .recommendations(campaignArn)
  .onItem("entry-1042", { itemIds: ["entry-2071"] });

const recommended = await simAws
  .personalizeRuntime()
  .getRecommendations(
    new GetRecommendationsCommand({ campaignArn, itemId: "entry-1042" }),
  );

// entry-2071
console.log(recommended.itemList?.[0]?.itemId);

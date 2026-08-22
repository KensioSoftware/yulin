/**
 * Serving recommendations from a Domain dataset group recommender.
 */

import {
  CreateDatasetGroupCommand,
  CreateRecommenderCommand,
} from "@aws-sdk/client-personalize";
import { GetRecommendationsCommand } from "@aws-sdk/client-personalize-runtime";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const group = await simAws.personalize().createDatasetGroup(
  new CreateDatasetGroupCommand({
    name: "catalogue",
    domain: "VIDEO_ON_DEMAND",
  }),
);

const recommender = await simAws.personalize().createRecommender(
  new CreateRecommenderCommand({
    name: "more-like-x",
    datasetGroupArn: group.datasetGroupArn,
    recipeArn: "arn:aws:personalize:::recipe/aws-vod-more-like-x",
  }),
);

const recommenderArn = recommender.recommenderArn!;

// More like X is answered from the item the request names. It carries a user
// as well, since AWS filters out what that user has already watched.
simAws
  .personalize()
  .recommendations(recommenderArn)
  .onItem("title-88", { itemIds: ["title-12", "title-40"] });

const recommended = await simAws.personalizeRuntime().getRecommendations(
  new GetRecommendationsCommand({
    recommenderArn,
    itemId: "title-88",
    userId: "viewer-7",
  }),
);

// title-12 title-40
console.log(recommended.itemList?.map((item) => item.itemId).join(" "));

/**
 * Ranking a list of entries for one user.
 */

import { GetPersonalizedRankingCommand } from "@aws-sdk/client-personalize-runtime";

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const campaignArn: string;

simAws
  .personalize()
  .rankings(campaignArn)
  .onUser("user-77", { itemIds: ["entry-3", "entry-1", "entry-2"] });

const ranked = await simAws.personalizeRuntime().getPersonalizedRanking(
  new GetPersonalizedRankingCommand({
    campaignArn,
    userId: "user-77",
    inputList: ["entry-1", "entry-2", "entry-3"],
  }),
);

// entry-3 entry-1 entry-2
console.log(ranked.personalizedRanking?.map((item) => item.itemId).join(" "));

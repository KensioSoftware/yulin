/**
 * Declaring the scores a campaign reports with its recommendations.
 */

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const campaignArn: string;

simAws
  .personalize()
  .recommendations(campaignArn)
  .onItem("entry-1042", {
    itemIds: [
      { itemId: "entry-2071", score: 0.62 },
      { itemId: "entry-3388", score: 0.38 },
    ],
    recommendationId: "RID-related-entries",
  });

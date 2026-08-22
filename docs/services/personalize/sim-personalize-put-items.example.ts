/**
 * Adding an item and a user through the events API.
 */

import {
  PutItemsCommand,
  PutUsersCommand,
} from "@aws-sdk/client-personalize-events";

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const itemsDatasetArn: string;
declare const usersDatasetArn: string;

await simAws.personalizeEvents().putItems(
  new PutItemsCommand({
    datasetArn: itemsDatasetArn,
    items: [
      { itemId: "entry-1042", properties: { category: "Horror|Action" } },
    ],
  }),
);

await simAws.personalizeEvents().putUsers(
  new PutUsersCommand({
    datasetArn: usersDatasetArn,
    users: [{ userId: "visitor-7", properties: { membership: "Frequent" } }],
  }),
);

// entry-1042 visitor-7
console.log(
  simAws.personalize().recordedItems()[0]?.itemId,
  simAws.personalize().recordedUsers()[0]?.userId,
);

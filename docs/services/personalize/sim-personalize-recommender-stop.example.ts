/**
 * Stopping and starting a recommender.
 */

import {
  StartRecommenderCommand,
  StopRecommenderCommand,
} from "@aws-sdk/client-personalize";

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const recommenderArn: string;

await simAws
  .personalize()
  .stopRecommender(new StopRecommenderCommand({ recommenderArn }));

// INACTIVE
console.log(simAws.personalize().findRecommender("more-like-x")?.status);

await simAws
  .personalize()
  .startRecommender(new StartRecommenderCommand({ recommenderArn }));

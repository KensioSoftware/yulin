import {
  CreateDatasetGroupCommand,
  CreateRecommenderCommand,
  DeleteRecommenderCommand,
  DescribeRecommenderCommand,
  ListRecommendersCommand,
  PersonalizeClient,
  StartRecommenderCommand,
  StopRecommenderCommand,
  UpdateRecommenderCommand,
} from "@aws-sdk/client-personalize";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("Personalize recommender SDK interception", () => {
  it("runs the seven recommender Commands through an intercepted client", async () => {
    // Given an intercepted PersonalizeClient over a simulated AWS.
    const simAws = new SimAws();
    const simSdk = new SimSdk({ simAws });
    const client = new PersonalizeClient({ region: "eu-west-2" });

    simSdk.intercept(client);

    try {
      // When the whole domain path runs through it.
      const group = await client.send(
        new CreateDatasetGroupCommand({
          name: "storefront",
          domain: "ECOMMERCE",
        }),
      );
      const created = await client.send(
        new CreateRecommenderCommand({
          name: "recommended-for-you",
          datasetGroupArn: group.datasetGroupArn,
          recipeArn:
            "arn:aws:personalize:::recipe/aws-ecomm-recommended-for-you",
        }),
      );

      assertNonNullable(created.recommenderArn);

      const { recommenderArn } = created;

      await client.send(
        new UpdateRecommenderCommand({
          recommenderArn,
          recommenderConfig: {
            itemExplorationConfig: { explorationWeight: "0.4" },
          },
        }),
      );
      await client.send(new StopRecommenderCommand({ recommenderArn }));

      const stopped = await client.send(
        new DescribeRecommenderCommand({ recommenderArn }),
      );

      await client.send(new StartRecommenderCommand({ recommenderArn }));

      const started = await client.send(
        new DescribeRecommenderCommand({ recommenderArn }),
      );
      const listed = await client.send(new ListRecommendersCommand({}));

      await client.send(new DeleteRecommenderCommand({ recommenderArn }));

      const remaining = await client.send(new ListRecommendersCommand({}));

      // Then each one reached the simulation and the scope is empty again.
      assertNonNullable(started.recommender);
      assertIdentical(stopped.recommender?.status, "INACTIVE");
      assertIdentical(started.recommender.status, "ACTIVE");
      assertIdentical(
        started.recommender.recommenderConfig?.itemExplorationConfig?.[
          "explorationWeight"
        ],
        "0.4",
      );
      assertArrayLength(listed.recommenders ?? [], 1);
      assertArrayLength(remaining.recommenders ?? [], 0);
    } finally {
      simSdk.restoreAll();
    }
  });
});

import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimPersonalize } from "../../sim-personalize.js";

const topPicks = "arn:aws:personalize:::recipe/aws-vod-top-picks";
const moreLikeX = "arn:aws:personalize:::recipe/aws-vod-more-like-x";
const recommendedForYou =
  "arn:aws:personalize:::recipe/aws-ecomm-recommended-for-you";

/**
 * A Domain dataset group and the simulated Personalize holding it.
 */
async function domainDatasetGroup(domain = "VIDEO_ON_DEMAND"): Promise<{
  readonly simAws: SimAws;
  readonly personalize: SimPersonalize;
  readonly datasetGroupArn: string;
}> {
  const simAws = new SimAws();
  const personalize = simAws.personalize();
  const group = await personalize.createDatasetGroup({
    input: { name: "catalogue", domain },
  });

  assertNonNullable(group.datasetGroupArn);

  return { simAws, personalize, datasetGroupArn: group.datasetGroupArn };
}

/** A Domain dataset group with one recommender on it. */
async function deployedRecommender(recipeArn = topPicks): Promise<{
  readonly simAws: SimAws;
  readonly personalize: SimPersonalize;
  readonly datasetGroupArn: string;
  readonly recommenderArn: string;
}> {
  const context = await domainDatasetGroup();
  const created = await context.personalize.createRecommender({
    input: {
      name: "top-picks",
      datasetGroupArn: context.datasetGroupArn,
      recipeArn,
    },
  });

  assertNonNullable(created.recommenderArn);

  return { ...context, recommenderArn: created.recommenderArn };
}

describe("simulated Personalize recommenders", () => {
  it("creates a recommender on a Domain dataset group", async () => {
    // Given a Domain dataset group, which is the only kind a recommender can
    // go on.
    const { personalize, datasetGroupArn, recommenderArn } =
      await deployedRecommender();

    // Then the recommender is ACTIVE straight away, with no solution and no
    // campaign in between it and the dataset group.
    const described = await personalize.describeRecommender({
      input: { recommenderArn },
    });

    assertNonNullable(described.recommender);
    assertIdentical(described.recommender.status, "ACTIVE");
    assertIdentical(described.recommender.name, "top-picks");
    assertIdentical(described.recommender.datasetGroupArn, datasetGroupArn);
    assertIdentical(described.recommender.recipeArn, topPicks);
    assertStringIncludes(recommenderArn, ":recommender/top-picks");

    const solutions = await personalize.listSolutions({ input: {} });

    assertArrayEmpty(solutions.solutions);
  });

  it("records the exploration configuration and reports it back", async () => {
    // Given a recommender configured to explore.
    const { personalize, datasetGroupArn } =
      await domainDatasetGroup("ECOMMERCE");
    const created = await personalize.createRecommender({
      input: {
        name: "recommended-for-you",
        datasetGroupArn,
        recipeArn: recommendedForYou,
        recommenderConfig: {
          itemExplorationConfig: {
            explorationWeight: "0.5",
            explorationItemAgeCutOff: "14",
          },
          minRecommendationRequestsPerSecond: 2,
        },
      },
    });

    // Then it reads back as it was given. Nothing here explores, and the
    // configuration is state a test can assert on.
    const described = await personalize.describeRecommender({
      input: { recommenderArn: created.recommenderArn },
    });
    const config = described.recommender?.recommenderConfig;

    assertNonNullable(config);
    assertIdentical(config.itemExplorationConfig?.["explorationWeight"], "0.5");
    assertIdentical(config.minRecommendationRequestsPerSecond, 2);
  });

  it("replaces the configuration an update gives it", async () => {
    // Given a recommender with no configuration.
    const { personalize, recommenderArn } = await deployedRecommender();

    // When it is updated.
    await personalize.updateRecommender({
      input: {
        recommenderArn,
        recommenderConfig: {
          itemExplorationConfig: { explorationWeight: "0.9" },
        },
      },
    });

    // Then it carries what the update gave it.
    const described = await personalize.describeRecommender({
      input: { recommenderArn },
    });

    assertIdentical(
      described.recommender?.recommenderConfig?.itemExplorationConfig?.[
        "explorationWeight"
      ],
      "0.9",
    );
  });

  it("clears the configuration an update leaves out", async () => {
    // Given a recommender created with an exploration weight.
    const { personalize, datasetGroupArn } = await domainDatasetGroup();
    const created = await personalize.createRecommender({
      input: {
        name: "top-picks",
        datasetGroupArn,
        recipeArn: topPicks,
        recommenderConfig: {
          itemExplorationConfig: { explorationWeight: "0.5" },
        },
      },
    });

    // When an update carries no configuration at all.
    await personalize.updateRecommender({
      input: { recommenderArn: created.recommenderArn },
    });

    // Then the recommender carries none. Real Personalize replaces the
    // configuration with the one it is given rather than merging into it.
    const described = await personalize.describeRecommender({
      input: { recommenderArn: created.recommenderArn },
    });

    assertUndefined(
      described.recommender?.recommenderConfig?.itemExplorationConfig,
    );
  });

  it("lists the recommenders of one dataset group", async () => {
    // Given two dataset groups, each with a recommender on it.
    const { personalize, datasetGroupArn } = await deployedRecommender();
    const other = await personalize.createDatasetGroup({
      input: { name: "storefront", domain: "ECOMMERCE" },
    });

    await personalize.createRecommender({
      input: {
        name: "recommended-for-you",
        datasetGroupArn: other.datasetGroupArn,
        recipeArn: recommendedForYou,
      },
    });

    // Then a list filtered by group answers with that group's own.
    const listed = await personalize.listRecommenders({
      input: { datasetGroupArn },
    });
    const all = await personalize.listRecommenders({ input: {} });

    assertArrayLength(listed.recommenders, 1);
    assertIdentical(listed.recommenders[0].name, "top-picks");
    assertArrayLength(all.recommenders, 2);
  });

  it("deletes a recommender, and refuses a group still holding one", async () => {
    // Given a Domain dataset group with a recommender on it.
    const { personalize, datasetGroupArn, recommenderArn } =
      await deployedRecommender();

    // When the group is deleted first.
    const error = await assertThrowsErrorAsync(async () => {
      await personalize.deleteDatasetGroup({ input: { datasetGroupArn } });
    });

    // Then it is reported as in use, naming what holds it.
    assertIdentical(error.name, "ResourceInUseException");
    assertStringIncludes(error.message, "1 recommender(s) on it");

    // And deleting the recommender first lets the group go.
    await personalize.deleteRecommender({ input: { recommenderArn } });
    await personalize.deleteDatasetGroup({ input: { datasetGroupArn } });

    const groups = await personalize.listDatasetGroups({ input: {} });

    assertArrayEmpty(groups.datasetGroups);
    assertUndefined(personalize.findRecommender("top-picks"));
  });

  it("refuses a recommender on a custom dataset group", async () => {
    // Given a dataset group created without a domain, which is a custom one.
    const simAws = new SimAws();
    const group = await simAws
      .personalize()
      .createDatasetGroup({ input: { name: "catalogue" } });

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.personalize().createRecommender({
        input: {
          name: "top-picks",
          datasetGroupArn: group.datasetGroupArn,
          recipeArn: topPicks,
        },
      });
    });

    // Then it is refused. A custom dataset group serves through a campaign.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "has no domain");
  });

  it("refuses a recipe belonging to the other domain", async () => {
    // Given an e-commerce dataset group and a video use case.
    const { personalize, datasetGroupArn } =
      await domainDatasetGroup("ECOMMERCE");

    const error = await assertThrowsErrorAsync(async () => {
      await personalize.createRecommender({
        input: { name: "top-picks", datasetGroupArn, recipeArn: moreLikeX },
      });
    });

    assertStringIncludes(error.message, "is a VIDEO_ON_DEMAND use case");
    assertStringIncludes(error.message, "ECOMMERCE domain dataset group");
  });

  it("refuses a custom recipe, which belongs to a solution", async () => {
    // Given a Domain dataset group and the recipe a solution would name.
    const { personalize, datasetGroupArn } = await domainDatasetGroup();

    const error = await assertThrowsErrorAsync(async () => {
      await personalize.createRecommender({
        input: {
          name: "similar",
          datasetGroupArn,
          recipeArn: "arn:aws:personalize:::recipe/aws-similar-items",
        },
      });
    });

    assertStringIncludes(
      error.message,
      "is not a Personalize domain use case recipe",
    );
  });
});

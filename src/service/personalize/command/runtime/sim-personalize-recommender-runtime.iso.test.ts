import { GetRecommendationsCommand } from "@aws-sdk/client-personalize-runtime";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

const useCases = {
  topPicks: "arn:aws:personalize:::recipe/aws-vod-top-picks",
  moreLikeX: "arn:aws:personalize:::recipe/aws-vod-more-like-x",
  becauseYouWatched:
    "arn:aws:personalize:::recipe/aws-vod-because-you-watched-x",
  mostPopular: "arn:aws:personalize:::recipe/aws-vod-most-popular",
};

/** A recommender on a video dataset group, for one use case. */
async function recommenderFor(recipeArn: string): Promise<{
  readonly simAws: SimAws;
  readonly recommenderArn: string;
}> {
  const simAws = new SimAws();
  const group = await simAws.personalize().createDatasetGroup({
    input: { name: "catalogue", domain: "VIDEO_ON_DEMAND" },
  });
  const created = await simAws.personalize().createRecommender({
    input: {
      name: "recommender",
      datasetGroupArn: group.datasetGroupArn,
      recipeArn,
    },
  });

  assertNonNullable(created.recommenderArn);

  return { simAws, recommenderArn: created.recommenderArn };
}

/** The item ids a runtime call answered with. */
function itemIds(
  itemList: readonly { readonly itemId?: string | undefined }[] | undefined,
): readonly (string | undefined)[] {
  return (itemList ?? []).map((item) => item.itemId);
}

describe("GetRecommendations from a recommender", () => {
  it("answers from what is declared against the recommender ARN", async () => {
    // Given a Top picks for you recommender with results declared for a user.
    const { simAws, recommenderArn } = await recommenderFor(useCases.topPicks);

    simAws
      .personalize()
      .recommendations(recommenderArn)
      .onUser("viewer-7", { itemIds: ["title-12", "title-40"] });

    // When the domain path asks for that user's recommendations.
    const recommended = await simAws
      .personalizeRuntime()
      .getRecommendations(
        new GetRecommendationsCommand({ recommenderArn, userId: "viewer-7" }),
      );

    // Then it answers with the declared items, the way a campaign does.
    assertArrayEquals(itemIds(recommended.itemList), ["title-12", "title-40"]);
  });

  it("answers a More like X recommender from the item", async () => {
    // Given a More like X recommender, whose requests name an item.
    const { simAws, recommenderArn } = await recommenderFor(useCases.moreLikeX);

    simAws
      .personalize()
      .recommendations(recommenderArn)
      .onItem("title-88", { itemIds: ["title-12"] });

    const recommended = await simAws
      .personalizeRuntime()
      .getRecommendations(
        new GetRecommendationsCommand({ recommenderArn, itemId: "title-88" }),
      );

    assertArrayEquals(itemIds(recommended.itemList), ["title-12"]);
  });

  it.each([
    { recipe: useCases.topPicks, omitted: "userId", carried: {} },
    {
      recipe: useCases.moreLikeX,
      omitted: "itemId",
      carried: { userId: "viewer-7" },
    },
    {
      recipe: useCases.becauseYouWatched,
      omitted: "userId",
      carried: { itemId: "title-88" },
    },
    { recipe: useCases.mostPopular, omitted: "userId", carried: {} },
  ])(
    "refuses a request omitting the $omitted its use case requires",
    async ({ recipe, omitted, carried }) => {
      // Given a recommender whose use case requires the omitted parameter.
      const { simAws, recommenderArn } = await recommenderFor(recipe);

      // When a request leaves it out.
      const error = await assertThrowsErrorAsync(async () => {
        await simAws
          .personalizeRuntime()
          .getRecommendations(
            new GetRecommendationsCommand({ recommenderArn, ...carried }),
          );
      });

      // Then it is refused, the way real Personalize refuses it, naming the
      // use case behind the requirement.
      assertIdentical(error.name, "InvalidInputException");
      assertStringIncludes(error.message, `needs a ${omitted}`);
    },
  );

  it("ignores a parameter its use case does not read", async () => {
    // Given a Top picks for you recommender with a rule for each tier.
    const { simAws, recommenderArn } = await recommenderFor(useCases.topPicks);

    simAws
      .personalize()
      .recommendations(recommenderArn)
      .onItem("title-88", { itemIds: ["wrong-tier"] });
    simAws
      .personalize()
      .recommendations(recommenderArn)
      .onUser("viewer-7", { itemIds: ["title-12"] });

    // When a request carries an item as well as the user.
    const recommended = await simAws.personalizeRuntime().getRecommendations(
      new GetRecommendationsCommand({
        recommenderArn,
        userId: "viewer-7",
        itemId: "title-88",
      }),
    );

    // Then it is answered from the user. Real Personalize does not read the
    // item for this use case, and answering from the item rule would pass here
    // on a path AWS never takes.
    assertArrayEquals(itemIds(recommended.itemList), ["title-12"]);
  });

  it("refuses a stopped recommender and serves again once started", async () => {
    // Given a recommender with results declared against it.
    const { simAws, recommenderArn } = await recommenderFor(useCases.topPicks);

    simAws
      .personalize()
      .recommendations(recommenderArn)
      .onUser("viewer-7", { itemIds: ["title-12"] });

    // When it is stopped.
    await simAws.personalize().stopRecommender({ input: { recommenderArn } });

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .personalizeRuntime()
        .getRecommendations(
          new GetRecommendationsCommand({ recommenderArn, userId: "viewer-7" }),
        );
    });

    // Then it serves nothing, and says how to bring it back.
    assertStringIncludes(error.message, "is INACTIVE");
    assertStringIncludes(error.message, "StartRecommender");

    // And starting it serves the same recommendations again.
    await simAws.personalize().startRecommender({ input: { recommenderArn } });

    const recommended = await simAws
      .personalizeRuntime()
      .getRecommendations(
        new GetRecommendationsCommand({ recommenderArn, userId: "viewer-7" }),
      );

    assertArrayEquals(itemIds(recommended.itemList), ["title-12"]);
  });

  it("refuses a request naming neither a campaign nor a recommender", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .personalizeRuntime()
        .getRecommendations(new GetRecommendationsCommand({}));
    });

    assertStringIncludes(
      error.message,
      "needs a campaignArn or a recommenderArn",
    );
  });

  it("refuses a request naming both", async () => {
    const { simAws, recommenderArn } = await recommenderFor(useCases.topPicks);

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.personalizeRuntime().getRecommendations(
        new GetRecommendationsCommand({
          recommenderArn,
          campaignArn: "arn:aws:personalize:eu-west-2:123456789012:campaign/c",
        }),
      );
    });

    assertStringIncludes(error.message, "not both");
  });

  it("refuses declaring rankings against a recommender", async () => {
    // Given a recommender, which serves recommendations and never a ranking.
    const { simAws, recommenderArn } = await recommenderFor(useCases.topPicks);

    const error = assertThrowsError(() => {
      simAws.personalize().rankings(recommenderArn);
    });

    // Then the declaration is refused where it was written, since
    // GetPersonalizedRanking has no recommender form.
    assertIdentical(error.name, "SimPersonalizeDeclarationError");
    assertStringIncludes(error.message, "rankings are declared against a");
  });

  it("refuses declaring against an ARN nothing is deployed at", () => {
    const simAws = new SimAws();

    const error = assertThrowsError(() => {
      simAws
        .personalize()
        .recommendations(
          "arn:aws:personalize:eu-west-2:123456789012:recommender/absent",
        );
    });

    assertStringIncludes(error.message, "campaign or recommender is deployed");
  });

  it("cuts a declared list to numResults", async () => {
    const { simAws, recommenderArn } = await recommenderFor(useCases.topPicks);

    simAws
      .personalize()
      .recommendations(recommenderArn)
      .onUser("viewer-7", { itemIds: ["a", "b", "c"] });

    const recommended = await simAws.personalizeRuntime().getRecommendations(
      new GetRecommendationsCommand({
        recommenderArn,
        userId: "viewer-7",
        numResults: 2,
      }),
    );

    assertArrayLength(recommended.itemList, 2);
  });
});

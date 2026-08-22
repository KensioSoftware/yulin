import {
  CreateCampaignCommand,
  CreateDatasetGroupCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
} from "@aws-sdk/client-personalize";
import { GetRecommendationsCommand } from "@aws-sdk/client-personalize-runtime";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

const similarItemsRecipe = "arn:aws:personalize:::recipe/aws-similar-items";

/**
 * Deploy a campaign, which is what a runtime call names and what results are
 * declared against.
 */
async function givenACampaign(
  simAws: SimAws,
  name = "related-entries",
): Promise<string> {
  const group = await simAws
    .personalize()
    .createDatasetGroup(
      new CreateDatasetGroupCommand({ name: `${name}-group` }),
    );
  const solution = await simAws.personalize().createSolution(
    new CreateSolutionCommand({
      name,
      datasetGroupArn: group.datasetGroupArn,
      recipeArn: similarItemsRecipe,
    }),
  );
  const version = await simAws
    .personalize()
    .createSolutionVersion(
      new CreateSolutionVersionCommand({ solutionArn: solution.solutionArn }),
    );
  const campaign = await simAws.personalize().createCampaign(
    new CreateCampaignCommand({
      name,
      solutionVersionArn: version.solutionVersionArn,
    }),
  );

  assertNonNullable(campaign.campaignArn);

  return campaign.campaignArn;
}

describe("Personalize GetRecommendations", () => {
  it("answers a related items request from an item rule", async () => {
    // Given a campaign with recommendations declared for one entry.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    simAws
      .personalize()
      .recommendations(campaignArn)
      .onItem("entry-1042", { itemIds: ["entry-2071", "entry-3388"] });

    // When the runtime is asked what is similar to that entry.
    const recommended = await simAws
      .personalizeRuntime()
      .getRecommendations(
        new GetRecommendationsCommand({ campaignArn, itemId: "entry-1042" }),
      );

    // Then the declared items come back in the order they were declared.
    assertArrayEquals(
      (recommended.itemList ?? []).map((item) => item.itemId),
      ["entry-2071", "entry-3388"],
    );
  });

  it("answers a personalization request from a user rule", async () => {
    // Given a campaign with recommendations declared for one user.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    simAws
      .personalize()
      .recommendations(campaignArn)
      .onUser("user-77", { itemIds: ["entry-9001"] });

    // When the runtime is asked what to show that user.
    const recommended = await simAws
      .personalizeRuntime()
      .getRecommendations(
        new GetRecommendationsCommand({ campaignArn, userId: "user-77" }),
      );

    // Then the user's declared items come back.
    assertArrayEquals(
      (recommended.itemList ?? []).map((item) => item.itemId),
      ["entry-9001"],
    );
  });

  it("prefers the item rule where a request carries both", async () => {
    // Given a campaign with a rule for an item and a rule for a user.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);
    const recommendations = simAws.personalize().recommendations(campaignArn);

    recommendations.onItem("entry-1042", { itemIds: ["by-item"] });
    recommendations.onUser("user-77", { itemIds: ["by-user"] });

    // When a request names both.
    const recommended = await simAws.personalizeRuntime().getRecommendations(
      new GetRecommendationsCommand({
        campaignArn,
        itemId: "entry-1042",
        userId: "user-77",
      }),
    );

    // Then the item rule is the one that answered.
    assertArrayEquals(
      (recommended.itemList ?? []).map((item) => item.itemId),
      ["by-item"],
    );
  });

  it("answers two campaigns from their own rules", async () => {
    // Given two campaigns carrying different recommendations for one entry.
    const simAws = new SimAws();
    const relatedArn = await givenACampaign(simAws, "related-entries");
    const trendingArn = await givenACampaign(simAws, "trending-entries");

    simAws
      .personalize()
      .recommendations(relatedArn)
      .onItem("entry-1042", { itemIds: ["entry-2071"] });
    simAws
      .personalize()
      .recommendations(trendingArn)
      .onItem("entry-1042", { itemIds: ["entry-5555"] });

    // When each is asked about the same entry.
    const related = await simAws.personalizeRuntime().getRecommendations(
      new GetRecommendationsCommand({
        campaignArn: relatedArn,
        itemId: "entry-1042",
      }),
    );
    const trending = await simAws.personalizeRuntime().getRecommendations(
      new GetRecommendationsCommand({
        campaignArn: trendingArn,
        itemId: "entry-1042",
      }),
    );

    // Then each answers with its own.
    assertArrayEquals(
      (related.itemList ?? []).map((item) => item.itemId),
      ["entry-2071"],
    );
    assertArrayEquals(
      (trending.itemList ?? []).map((item) => item.itemId),
      ["entry-5555"],
    );
  });

  it("falls back to the declared default", async () => {
    // Given a campaign with a default and a rule for another entry.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);
    const recommendations = simAws.personalize().recommendations(campaignArn);

    recommendations.byDefault({ itemIds: ["entry-popular"] });
    recommendations.onItem("entry-1042", { itemIds: ["entry-2071"] });

    // When an entry no rule matches is asked about.
    const recommended = await simAws
      .personalizeRuntime()
      .getRecommendations(
        new GetRecommendationsCommand({ campaignArn, itemId: "entry-0000" }),
      );

    // Then the default answered it.
    assertArrayEquals(
      (recommended.itemList ?? []).map((item) => item.itemId),
      ["entry-popular"],
    );
  });

  it("recommends nothing where nothing is declared", async () => {
    // Given a campaign with no recommendations declared against it.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    // When the runtime is asked about an entry.
    const recommended = await simAws
      .personalizeRuntime()
      .getRecommendations(
        new GetRecommendationsCommand({ campaignArn, itemId: "entry-1042" }),
      );

    // Then the item list is empty rather than invented.
    assertArrayLength(recommended.itemList ?? [], 0);
    assertUndefined(recommended.recommendationId);
  });

  it("reports the scores and recommendation id a rule declares", async () => {
    // Given recommendations declared with scores and a recommendation id.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    simAws
      .personalize()
      .recommendations(campaignArn)
      .onItem("entry-1042", {
        itemIds: [
          { itemId: "entry-2071", score: 0.62 },
          { itemId: "entry-3388", score: 0.38 },
        ],
        recommendationId: "RID-declared",
      });

    // When the runtime answers from that rule.
    const recommended = await simAws
      .personalizeRuntime()
      .getRecommendations(
        new GetRecommendationsCommand({ campaignArn, itemId: "entry-1042" }),
      );

    // Then the declaration's own numbers come back.
    assertNonNullable(recommended.itemList);
    assertIdentical(recommended.itemList[0]?.score, 0.62);
    assertIdentical(recommended.itemList[1]?.score, 0.38);
    assertIdentical(recommended.recommendationId, "RID-declared");
  });

  it("truncates a declared list to numResults", async () => {
    // Given a campaign declaring three items for one entry.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    simAws
      .personalize()
      .recommendations(campaignArn)
      .onItem("entry-1042", {
        itemIds: ["entry-2071", "entry-3388", "entry-4499"],
      });

    // When two are asked for.
    const recommended = await simAws.personalizeRuntime().getRecommendations(
      new GetRecommendationsCommand({
        campaignArn,
        itemId: "entry-1042",
        numResults: 2,
      }),
    );

    // Then the list is cut to the first two.
    assertArrayEquals(
      (recommended.itemList ?? []).map((item) => item.itemId),
      ["entry-2071", "entry-3388"],
    );
  });

  it("refuses a number of results Personalize would not return", async () => {
    // Given a campaign.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    // When more results are asked for than Personalize will return.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeRuntime().getRecommendations(
          new GetRecommendationsCommand({
            campaignArn,
            itemId: "entry-1042",
            numResults: 501,
          }),
        ),
    );

    // Then it is refused as invalid input.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "numResults");
  });

  it("refuses a filter it cannot apply", async () => {
    // Given a campaign.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    // When a request names a filter.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeRuntime().getRecommendations(
          new GetRecommendationsCommand({
            campaignArn,
            itemId: "entry-1042",
            filterArn: "arn:aws:personalize:eu-west-2:123456789012:filter/f",
          }),
        ),
    );

    // Then it is refused by name rather than ignored.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "filterArn is not simulated");
  });
});

import {
  CreateCampaignCommand,
  CreateDatasetGroupCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
} from "@aws-sdk/client-personalize";
import { GetPersonalizedRankingCommand } from "@aws-sdk/client-personalize-runtime";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

const rankingRecipe = "arn:aws:personalize:::recipe/aws-personalized-ranking";

/**
 * Deploy a campaign, which is what a runtime call names and what results are
 * declared against.
 */
async function givenACampaign(
  simAws: SimAws,
  name = "ranked-entries",
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
      recipeArn: rankingRecipe,
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

describe("Personalize GetPersonalizedRanking", () => {
  it("ranks the input list as a user rule declares", async () => {
    // Given a campaign ranking three entries for one user.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    simAws
      .personalize()
      .rankings(campaignArn)
      .onUser("user-77", { itemIds: ["entry-3", "entry-1", "entry-2"] });

    // When that user's list is ranked.
    const ranked = await simAws.personalizeRuntime().getPersonalizedRanking(
      new GetPersonalizedRankingCommand({
        campaignArn,
        userId: "user-77",
        inputList: ["entry-1", "entry-2", "entry-3"],
      }),
    );

    // Then the declared order is the one that came back.
    assertArrayEquals(
      (ranked.personalizedRanking ?? []).map((item) => item.itemId),
      ["entry-3", "entry-1", "entry-2"],
    );
  });

  it("keeps the input order where no rule matches", async () => {
    // Given a campaign with nothing declared against it.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    // When a list is ranked.
    const ranked = await simAws.personalizeRuntime().getPersonalizedRanking(
      new GetPersonalizedRankingCommand({
        campaignArn,
        userId: "user-77",
        inputList: ["entry-1", "entry-2", "entry-3"],
      }),
    );

    // Then it comes back in the order it arrived, scored downwards.
    assertNonNullable(ranked.personalizedRanking);
    assertArrayEquals(
      ranked.personalizedRanking.map((item) => item.itemId),
      ["entry-1", "entry-2", "entry-3"],
    );
    assertArrayEquals(
      ranked.personalizedRanking.map((item) => item.score),
      [3 / 6, 2 / 6, 1 / 6],
    );
  });

  it("scores a ranking it was not told about to one", async () => {
    // Given a campaign with nothing declared against it.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    // When a list is ranked.
    const ranked = await simAws.personalizeRuntime().getPersonalizedRanking(
      new GetPersonalizedRankingCommand({
        campaignArn,
        userId: "user-77",
        inputList: ["entry-1", "entry-2", "entry-3", "entry-4"],
      }),
    );

    // Then the scores sum to one across the list, as a real ranking's do.
    const total = (ranked.personalizedRanking ?? []).reduce(
      (sum, item) => sum + (item.score ?? 0),
      0,
    );
    assertTrue(Math.abs(total - 1) < 0.000001);
  });

  it("answers a user no rule matches from the default", async () => {
    // Given a campaign with a default ranking and a rule for one user.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);
    const rankings = simAws.personalize().rankings(campaignArn);

    rankings.byDefault({ itemIds: ["entry-2", "entry-1"] });
    rankings.onUser("user-77", { itemIds: ["entry-1", "entry-2"] });

    // When another user's list is ranked.
    const ranked = await simAws.personalizeRuntime().getPersonalizedRanking(
      new GetPersonalizedRankingCommand({
        campaignArn,
        userId: "user-99",
        inputList: ["entry-1", "entry-2"],
      }),
    );

    // Then the default answered it.
    assertArrayEquals(
      (ranked.personalizedRanking ?? []).map((item) => item.itemId),
      ["entry-2", "entry-1"],
    );
  });

  it("requires a user to rank for", async () => {
    // Given a campaign.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    // When a ranking names no user. The SDK's own types require one, so the
    // request is written out as the command the simulator takes.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeRuntime().getPersonalizedRanking({
          input: { campaignArn, inputList: ["entry-1"] },
        }),
    );

    // Then it is refused as invalid input, as real Personalize refuses it.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "userId");
  });

  it("requires a list to rank", async () => {
    // Given a campaign.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    // When a ranking carries no items.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeRuntime().getPersonalizedRanking(
          new GetPersonalizedRankingCommand({
            campaignArn,
            userId: "user-77",
            inputList: [],
          }),
        ),
    );

    // Then it is refused as invalid input.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "inputList");
  });
});

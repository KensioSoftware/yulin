import {
  CreateCampaignCommand,
  CreateDatasetGroupCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
  DeleteCampaignCommand,
  DescribeCampaignCommand,
} from "@aws-sdk/client-personalize";
import { GetRecommendationsCommand } from "@aws-sdk/client-personalize-runtime";
import {
  assertArrayEmpty,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

const similarItemsRecipe = "arn:aws:personalize:::recipe/aws-similar-items";

const absentCampaignArn =
  "arn:aws:personalize:eu-west-2:123456789012:campaign/absent";

/**
 * Deploy a campaign, which is what results are declared against.
 */
async function givenACampaign(simAws: SimAws): Promise<string> {
  const group = await simAws
    .personalize()
    .createDatasetGroup(new CreateDatasetGroupCommand({ name: "entries" }));
  const solution = await simAws.personalize().createSolution(
    new CreateSolutionCommand({
      name: "related-entries",
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
      name: "related-entries",
      solutionVersionArn: version.solutionVersionArn,
    }),
  );

  assertNonNullable(campaign.campaignArn);

  return campaign.campaignArn;
}

describe("Personalize declared results", () => {
  it("refuses recommendations declared against a campaign that is not there", async () => {
    // Given a simulated Personalize holding no campaign.
    const simAws = new SimAws();

    // When recommendations are declared against an ARN.
    const declared = assertThrowsError(() =>
      simAws.personalize().recommendations(absentCampaignArn),
    );

    // And when the runtime is called with the same ARN.
    const called = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalizeRuntime()
          .getRecommendations(
            new GetRecommendationsCommand({ campaignArn: absentCampaignArn }),
          ),
    );

    // Then the declaration is a mistake in the test, and the call is a missing
    // resource, as it is on real Personalize Runtime.
    assertIdentical(declared.name, "SimPersonalizeDeclarationError");
    assertStringIncludes(declared.message, absentCampaignArn);
    assertIdentical(called.name, "ResourceNotFoundException");
  });

  it("refuses rankings declared against a campaign that is not there", () => {
    // Given a simulated Personalize holding no campaign.
    const simAws = new SimAws();

    // When rankings are declared against an ARN.
    const error = assertThrowsError(() =>
      simAws.personalize().rankings(absentCampaignArn),
    );

    // Then the mistake is reported where it was made.
    assertIdentical(error.name, "SimPersonalizeDeclarationError");
  });

  it("refuses a rule with no id to match", async () => {
    // Given a campaign.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    // When rules are declared against an empty item id and user id.
    const onItem = assertThrowsError(() => {
      simAws
        .personalize()
        .recommendations(campaignArn)
        .onItem("", { itemIds: ["entry-2071"] });
    });
    const onUser = assertThrowsError(() => {
      simAws
        .personalize()
        .rankings(campaignArn)
        .onUser("", { itemIds: ["entry-1"] });
    });

    // Then both are refused where the declaration is made.
    assertIdentical(onItem.name, "SimPersonalizeDeclarationError");
    assertStringIncludes(onItem.message, "an item id");
    assertIdentical(onUser.name, "SimPersonalizeDeclarationError");
    assertStringIncludes(onUser.message, "a user id");
  });

  it("forgets what was declared against a campaign that was deleted", async () => {
    // Given a campaign with recommendations declared against it.
    const simAws = new SimAws();
    const campaignArn = await givenACampaign(simAws);

    simAws
      .personalize()
      .recommendations(campaignArn)
      .onItem("entry-1042", { itemIds: ["entry-2071"] });

    // When it is deleted and deployed again under the same name.
    const described = await simAws
      .personalize()
      .describeCampaign(new DescribeCampaignCommand({ campaignArn }));
    await simAws
      .personalize()
      .deleteCampaign(new DeleteCampaignCommand({ campaignArn }));
    const replacement = await simAws.personalize().createCampaign(
      new CreateCampaignCommand({
        name: "related-entries",
        solutionVersionArn: described.campaign?.solutionVersionArn,
      }),
    );
    assertIdentical(replacement.campaignArn, campaignArn);

    // Then the new campaign starts with nothing declared against it.
    const recommended = await simAws
      .personalizeRuntime()
      .getRecommendations(
        new GetRecommendationsCommand({ campaignArn, itemId: "entry-1042" }),
      );
    assertArrayEmpty(recommended.itemList ?? []);
  });
});

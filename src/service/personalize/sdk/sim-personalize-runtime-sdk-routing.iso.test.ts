import {
  CreateCampaignCommand,
  CreateDatasetGroupCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
  PersonalizeClient,
} from "@aws-sdk/client-personalize";
import {
  GetPersonalizedRankingCommand,
  GetRecommendationsCommand,
  PersonalizeRuntimeClient,
} from "@aws-sdk/client-personalize-runtime";
import {
  assertArrayEquals,
  assertArrayLength,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

const similarItemsRecipe = "arn:aws:personalize:::recipe/aws-similar-items";

describe("Personalize Runtime SDK interception", () => {
  it("answers an intercepted PersonalizeRuntimeClient from declared results", async () => {
    // Given an intercepted Personalize client and runtime client.
    const simSdk = new SimSdk();
    simSdk.intercept(PersonalizeClient);
    simSdk.intercept(PersonalizeRuntimeClient);

    const client = new PersonalizeClient({ region: "eu-west-2" });
    const runtime = new PersonalizeRuntimeClient({ region: "eu-west-2" });

    try {
      // And a campaign with recommendations declared against it.
      const group = await client.send(
        new CreateDatasetGroupCommand({ name: "entries" }),
      );
      const solution = await client.send(
        new CreateSolutionCommand({
          name: "related-entries",
          datasetGroupArn: group.datasetGroupArn,
          recipeArn: similarItemsRecipe,
        }),
      );
      const version = await client.send(
        new CreateSolutionVersionCommand({ solutionArn: solution.solutionArn }),
      );
      const campaign = await client.send(
        new CreateCampaignCommand({
          name: "related-entries",
          solutionVersionArn: version.solutionVersionArn,
        }),
      );
      assertNonNullable(campaign.campaignArn);

      simSdk.simAws
        .account()
        .region("eu-west-2")
        .personalize()
        .recommendations(campaign.campaignArn)
        .onItem("entry-1042", { itemIds: ["entry-2071"] });

      // When ordinary SDK code asks both runtime operations.
      const recommended = await runtime.send(
        new GetRecommendationsCommand({
          campaignArn: campaign.campaignArn,
          itemId: "entry-1042",
        }),
      );
      const ranked = await runtime.send(
        new GetPersonalizedRankingCommand({
          campaignArn: campaign.campaignArn,
          userId: "user-77",
          inputList: ["entry-1", "entry-2"],
        }),
      );

      // Then both are answered with nothing touching the network.
      assertArrayEquals(
        (recommended.itemList ?? []).map((item) => item.itemId),
        ["entry-2071"],
      );
      assertArrayEquals(
        (ranked.personalizedRanking ?? []).map((item) => item.itemId),
        ["entry-1", "entry-2"],
      );
    } finally {
      simSdk.restoreAll();
    }
  });

  it("supports the Commands its router names and no others", () => {
    // Given a simulated Personalize Runtime.
    const simAws = new SimAws();

    // When its router is asked what it handles.
    const supported = simAws.personalizeRuntime().sdkCommandRouter();

    // Then every name is one the router has a route for.
    for (const commandName of supported.supportedCommandNames()) {
      assertNonNullable(supported.route(commandName));
    }

    assertUndefined(supported.route("GetActionRecommendationsCommand"));
    assertArrayLength(supported.supportedCommandNames(), 2);
  });
});

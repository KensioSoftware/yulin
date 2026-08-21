import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateCampaignCommand,
  CreateDatasetGroupCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
} from "@aws-sdk/client-personalize";
import {
  GetPersonalizedRankingCommand,
  GetRecommendationsCommand,
} from "@aws-sdk/client-personalize-runtime";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

const accountIdOneOnes = "111111111111";

const similarItemsRecipe = "arn:aws:personalize:::recipe/aws-similar-items";

/**
 * Deploy a campaign to call the runtime against.
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

/**
 * A Role whose policy allows one action on one resource.
 */
async function givenARoleAllowedTo(
  simAws: SimAws,
  action: string,
  resource = "*",
): Promise<string> {
  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "PersonalizeRuntimeCaller",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountIdOneOnes}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "PersonalizeRuntimeCaller",
      PolicyName: "PersonalizeRuntimePolicy",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: action, Resource: resource },
      }),
    }),
  );

  assertNonNullable(role.Role.Arn);

  return role.Role.Arn;
}

describe("Personalize Runtime IAM authorization", () => {
  it("allows a recommendation the caller's policy permits on the campaign", async () => {
    // Given a Role allowed to recommend from one campaign.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const campaignArn = await givenACampaign(simAws);
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "personalize:GetRecommendations",
      campaignArn,
    );

    simAws
      .personalize()
      .recommendations(campaignArn)
      .byDefault({ itemIds: ["entry-2071"] });

    // When it asks for recommendations.
    const recommended = await simAws
      .personalizeRuntime()
      .getRecommendations(
        new GetRecommendationsCommand({ campaignArn, itemId: "entry-1042" }),
        { caller: { kind: "arn", arn: roleArn } },
      );

    // Then it goes through.
    assertArrayLength(recommended.itemList ?? [], 1);
  });

  it("denies a recommendation the caller's policy leaves out", async () => {
    // Given a Role allowed only to rank.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const campaignArn = await givenACampaign(simAws);
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "personalize:GetPersonalizedRanking",
    );

    // When it asks for recommendations.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalizeRuntime()
          .getRecommendations(new GetRecommendationsCommand({ campaignArn }), {
            caller: { kind: "arn", arn: roleArn },
          }),
    );

    // Then Personalize reports it in its own terms, naming the action.
    assertIdentical(error.name, "AccessDeniedException");
    assertStringIncludes(error.message, "personalize:GetRecommendations");
  });

  it("denies a ranking against a campaign the policy does not name", async () => {
    // Given a Role allowed to rank against another campaign's ARN.
    const simAws = new SimAws({ defaultAccountId: accountIdOneOnes });
    const campaignArn = await givenACampaign(simAws);
    const roleArn = await givenARoleAllowedTo(
      simAws,
      "personalize:GetPersonalizedRanking",
      `${campaignArn}-other`,
    );

    // When it ranks against this one.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeRuntime().getPersonalizedRanking(
          new GetPersonalizedRankingCommand({
            campaignArn,
            userId: "user-77",
            inputList: ["entry-1"],
          }),
          { caller: { kind: "arn", arn: roleArn } },
        ),
    );

    // Then the resource in the policy is what decides it.
    assertIdentical(error.name, "AccessDeniedException");
  });
});

import {
  CreateCampaignCommand,
  CreateDatasetGroupCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
  DeleteCampaignCommand,
  DeleteDatasetGroupCommand,
  DeleteSolutionCommand,
  DescribeCampaignCommand,
  ListCampaignsCommand,
} from "@aws-sdk/client-personalize";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

const similarItemsRecipe = "arn:aws:personalize:::recipe/aws-similar-items";

interface Chain {
  readonly datasetGroupArn: string;
  readonly solutionArn: string;
  readonly solutionVersionArn: string;
}

async function givenASolutionVersion(
  simAws: SimAws,
  name = "related-words",
): Promise<Chain> {
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
  const version = await simAws.personalize().createSolutionVersion(
    new CreateSolutionVersionCommand({
      solutionArn: solution.solutionArn,
    }),
  );

  assertNonNullable(group.datasetGroupArn);
  assertNonNullable(solution.solutionArn);
  assertNonNullable(version.solutionVersionArn);

  return {
    datasetGroupArn: group.datasetGroupArn,
    solutionArn: solution.solutionArn,
    solutionVersionArn: version.solutionVersionArn,
  };
}

describe("Personalize CreateCampaign", () => {
  it("reports the solution version and its own ARN back", async () => {
    // Given a simulated AWS holding a solution version.
    const simAws = new SimAws();
    const { solutionVersionArn } = await givenASolutionVersion(simAws);

    // When a campaign deploys it.
    const created = await simAws.personalize().createCampaign(
      new CreateCampaignCommand({
        name: "related-words",
        solutionVersionArn,
      }),
    );

    // Then describing the campaign gives both ARNs back.
    const described = await simAws
      .personalize()
      .describeCampaign(
        new DescribeCampaignCommand({ campaignArn: created.campaignArn }),
      );
    assertNonNullable(described.campaign);
    assertIdentical(described.campaign.campaignArn, created.campaignArn);
    assertIdentical(described.campaign.solutionVersionArn, solutionVersionArn);
    assertIdentical(described.campaign.status, "ACTIVE");
  });

  it("provisions one request per second by default", async () => {
    // Given a simulated AWS holding a solution version.
    const simAws = new SimAws();
    const { solutionVersionArn } = await givenASolutionVersion(simAws);

    // When a campaign is created without naming a throughput.
    const created = await simAws.personalize().createCampaign(
      new CreateCampaignCommand({
        name: "related-words",
        solutionVersionArn,
      }),
    );

    // Then it carries the default real Personalize recommends starting at.
    const described = await simAws
      .personalize()
      .describeCampaign(
        new DescribeCampaignCommand({ campaignArn: created.campaignArn }),
      );
    assertIdentical(described.campaign?.minProvisionedTPS, 1);
  });

  it("refuses a throughput below one request per second", async () => {
    // Given a simulated AWS holding a solution version.
    const simAws = new SimAws();
    const { solutionVersionArn } = await givenASolutionVersion(simAws);

    // When a campaign asks for no provisioned throughput at all.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().createCampaign(
          new CreateCampaignCommand({
            name: "related-words",
            solutionVersionArn,
            minProvisionedTPS: 0,
          }),
        ),
    );

    // Then Personalize refuses it as invalid input.
    assertIdentical(error.name, "InvalidInputException");
  });

  it("refuses a campaign whose solution version is absent", async () => {
    // Given a simulated AWS holding no solution versions.
    const simAws = new SimAws();

    // When a campaign names one that was never created.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().createCampaign(
          new CreateCampaignCommand({
            name: "related-words",
            solutionVersionArn:
              "arn:aws:personalize:eu-west-2:111111111111:solution/gone/1",
          }),
        ),
    );

    // Then Personalize reports it as missing.
    assertIdentical(error.name, "ResourceNotFoundException");
  });
});

describe("Personalize ListCampaigns", () => {
  it("filters by the solution behind the campaign's version", async () => {
    // Given a simulated AWS holding a campaign on each of two solutions.
    const simAws = new SimAws();
    const words = await givenASolutionVersion(simAws, "related-words");
    const lessons = await givenASolutionVersion(simAws, "related-lessons");
    await simAws.personalize().createCampaign(
      new CreateCampaignCommand({
        name: "words",
        solutionVersionArn: words.solutionVersionArn,
      }),
    );
    await simAws.personalize().createCampaign(
      new CreateCampaignCommand({
        name: "lessons",
        solutionVersionArn: lessons.solutionVersionArn,
      }),
    );

    // When one solution's campaigns are listed.
    const listed = await simAws
      .personalize()
      .listCampaigns(
        new ListCampaignsCommand({ solutionArn: words.solutionArn }),
      );

    // Then only the campaign deploying that solution's version comes back.
    assertArrayLength(listed.campaigns ?? [], 1);
    assertIdentical(listed.campaigns?.[0]?.name, "words");
  });
});

describe("Personalize DeleteCampaign", () => {
  it("forgets a campaign", async () => {
    // Given a simulated AWS holding a campaign.
    const simAws = new SimAws();
    const { solutionVersionArn } = await givenASolutionVersion(simAws);
    const created = await simAws.personalize().createCampaign(
      new CreateCampaignCommand({
        name: "related-words",
        solutionVersionArn,
      }),
    );

    // When it is deleted.
    await simAws
      .personalize()
      .deleteCampaign(
        new DeleteCampaignCommand({ campaignArn: created.campaignArn }),
      );

    // Then nothing is left to list.
    const listed = await simAws
      .personalize()
      .listCampaigns(new ListCampaignsCommand({}));
    assertArrayLength(listed.campaigns ?? [], 0);
  });
});

describe("Personalize resources still in use", () => {
  it("holds a solution a campaign still deploys", async () => {
    // Given a simulated AWS holding a campaign on a solution version.
    const simAws = new SimAws();
    const { solutionArn, solutionVersionArn } =
      await givenASolutionVersion(simAws);
    await simAws.personalize().createCampaign(
      new CreateCampaignCommand({
        name: "related-words",
        solutionVersionArn,
      }),
    );

    // When the solution behind it is deleted.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .deleteSolution(new DeleteSolutionCommand({ solutionArn })),
    );

    // Then Personalize reports it as still in use.
    assertIdentical(error.name, "ResourceInUseException");
  });

  it("holds a dataset group that still holds a solution", async () => {
    // Given a simulated AWS holding a solution in a dataset group.
    const simAws = new SimAws();
    const { datasetGroupArn } = await givenASolutionVersion(simAws);

    // When the dataset group is deleted.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .deleteDatasetGroup(
            new DeleteDatasetGroupCommand({ datasetGroupArn }),
          ),
    );

    // Then Personalize reports it as still in use, as it does on real AWS.
    assertIdentical(error.name, "ResourceInUseException");
  });

  it("lets the whole chain be torn down from the far end", async () => {
    // Given a simulated AWS holding a campaign on a solution in a group.
    const simAws = new SimAws();
    const { datasetGroupArn, solutionArn, solutionVersionArn } =
      await givenASolutionVersion(simAws);
    const campaign = await simAws.personalize().createCampaign(
      new CreateCampaignCommand({
        name: "related-words",
        solutionVersionArn,
      }),
    );

    // When each is deleted in turn, innermost first.
    await simAws
      .personalize()
      .deleteCampaign(
        new DeleteCampaignCommand({ campaignArn: campaign.campaignArn }),
      );
    await simAws
      .personalize()
      .deleteSolution(new DeleteSolutionCommand({ solutionArn }));
    await simAws
      .personalize()
      .deleteDatasetGroup(new DeleteDatasetGroupCommand({ datasetGroupArn }));

    // Then the group goes, because nothing is left holding it.
    assertUndefined(
      simAws.personalize().findDatasetGroup("related-words-group"),
    );
  });
});

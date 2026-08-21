import {
  CreateDatasetGroupCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
  DeleteSolutionCommand,
  DescribeSolutionCommand,
  DescribeSolutionVersionCommand,
  ListSolutionVersionsCommand,
  ListSolutionsCommand,
} from "@aws-sdk/client-personalize";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

const similarItemsRecipe = "arn:aws:personalize:::recipe/aws-similar-items";
const accountIdOneOnes = "111111111111";

async function givenASolution(
  simAws: SimAws,
  name = "related-words",
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

  assertNonNullable(solution.solutionArn);

  return solution.solutionArn;
}

describe("Personalize CreateSolution", () => {
  it("records the recipe without looking it up", async () => {
    // Given a simulated AWS holding a dataset group.
    const simAws = new SimAws();
    const solutionArn = await givenASolution(simAws);

    // When the solution is described.
    const described = await simAws
      .personalize()
      .describeSolution(new DescribeSolutionCommand({ solutionArn }));

    // Then the recipe comes back as it was given. Nothing trains, so no
    // catalogue of recipes had to hold it.
    assertNonNullable(described.solution);
    assertIdentical(described.solution.recipeArn, similarItemsRecipe);
    assertIdentical(described.solution.status, "ACTIVE");
  });

  it("refuses a solution whose dataset group is absent", async () => {
    // Given a simulated AWS holding no dataset groups.
    const simAws = new SimAws();

    // When a solution names one that was never created.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().createSolution(
          new CreateSolutionCommand({
            name: "related-words",
            datasetGroupArn:
              "arn:aws:personalize:eu-west-2:111111111111:dataset-group/gone",
            recipeArn: similarItemsRecipe,
          }),
        ),
    );

    // Then Personalize reports the parent as missing.
    assertIdentical(error.name, "ResourceNotFoundException");
  });
});

describe("Personalize CreateSolutionVersion", () => {
  it("gives an active version with no clock advance", async () => {
    // Given a simulated AWS holding a solution.
    const simAws = new SimAws({
      defaultAccountId: accountIdOneOnes,
      defaultRegionName: "eu-west-2",
    });
    const solutionArn = await givenASolution(simAws);

    // When a version is created.
    const version = await simAws
      .personalize()
      .createSolutionVersion(new CreateSolutionVersionCommand({ solutionArn }));

    // Then it is active straight away, where real Personalize would train for
    // tens of minutes first.
    const described = await simAws.personalize().describeSolutionVersion(
      new DescribeSolutionVersionCommand({
        solutionVersionArn: version.solutionVersionArn,
      }),
    );
    assertNonNullable(described.solutionVersion);
    assertIdentical(described.solutionVersion.status, "ACTIVE");
    assertIdentical(described.solutionVersion.trainingMode, "FULL");
  });

  it("names the version under its solution", async () => {
    // Given a simulated AWS holding a solution.
    const simAws = new SimAws({
      defaultAccountId: accountIdOneOnes,
      defaultRegionName: "eu-west-2",
    });
    const solutionArn = await givenASolution(simAws);

    // When two versions are created.
    const first = await simAws
      .personalize()
      .createSolutionVersion(new CreateSolutionVersionCommand({ solutionArn }));
    const second = await simAws
      .personalize()
      .createSolutionVersion(new CreateSolutionVersionCommand({ solutionArn }));

    // Then each ARN is the solution's with a version on the end, counted so a
    // test can write it down.
    assertIdentical(first.solutionVersionArn, `${solutionArn}/1`);
    assertIdentical(second.solutionVersionArn, `${solutionArn}/2`);
  });

  it("reports the latest version from the solution", async () => {
    // Given a simulated AWS holding a solution with two versions.
    const simAws = new SimAws();
    const solutionArn = await givenASolution(simAws);
    await simAws
      .personalize()
      .createSolutionVersion(new CreateSolutionVersionCommand({ solutionArn }));
    const second = await simAws
      .personalize()
      .createSolutionVersion(new CreateSolutionVersionCommand({ solutionArn }));

    // When the solution is described.
    const described = await simAws
      .personalize()
      .describeSolution(new DescribeSolutionCommand({ solutionArn }));

    // Then it names the most recent version.
    assertIdentical(
      described.solution?.latestSolutionVersion?.solutionVersionArn,
      second.solutionVersionArn,
    );
  });

  it("refuses a training mode Personalize has no name for", async () => {
    // Given a simulated AWS holding a solution.
    const simAws = new SimAws();
    const solutionArn = await givenASolution(simAws);

    // When a version is created with a training mode that does not exist. The
    // SDK's own types rule this out, so it arrives as request input would.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().createSolutionVersion({
          input: { solutionArn, trainingMode: "PARTIAL" },
        }),
    );

    // Then Personalize refuses it as invalid input.
    assertIdentical(error.name, "InvalidInputException");
  });
});

describe("Personalize ListSolutions", () => {
  it("filters by dataset group when one is named", async () => {
    // Given a simulated AWS holding two solutions in different groups.
    const simAws = new SimAws();
    const first = await givenASolution(simAws, "related-words");
    await givenASolution(simAws, "related-lessons");
    const described = await simAws
      .personalize()
      .describeSolution(new DescribeSolutionCommand({ solutionArn: first }));

    // When one group's solutions are listed.
    const listed = await simAws.personalize().listSolutions(
      new ListSolutionsCommand({
        datasetGroupArn: described.solution?.datasetGroupArn,
      }),
    );

    // Then only that group's solution comes back.
    assertArrayLength(listed.solutions ?? [], 1);
    assertIdentical(listed.solutions?.[0]?.name, "related-words");
  });
});

describe("Personalize ListSolutionVersions", () => {
  it("lists the versions of one solution", async () => {
    // Given a simulated AWS holding two solutions with a version each.
    const simAws = new SimAws();
    const first = await givenASolution(simAws, "related-words");
    const second = await givenASolution(simAws, "related-lessons");
    await simAws
      .personalize()
      .createSolutionVersion(
        new CreateSolutionVersionCommand({ solutionArn: first }),
      );
    await simAws
      .personalize()
      .createSolutionVersion(
        new CreateSolutionVersionCommand({ solutionArn: second }),
      );

    // When one solution's versions are listed.
    const listed = await simAws
      .personalize()
      .listSolutionVersions(
        new ListSolutionVersionsCommand({ solutionArn: first }),
      );

    // Then only its version comes back.
    assertArrayLength(listed.solutionVersions ?? [], 1);
    assertIdentical(
      listed.solutionVersions?.[0]?.solutionVersionArn,
      `${first}/1`,
    );
  });
});

describe("Personalize DeleteSolution", () => {
  it("takes the solution's versions with it", async () => {
    // Given a simulated AWS holding a solution with a version.
    const simAws = new SimAws();
    const solutionArn = await givenASolution(simAws);
    await simAws
      .personalize()
      .createSolutionVersion(new CreateSolutionVersionCommand({ solutionArn }));

    // When the solution is deleted.
    await simAws
      .personalize()
      .deleteSolution(new DeleteSolutionCommand({ solutionArn }));

    // Then its versions are gone too, because a version has no delete of its
    // own on real Personalize either.
    const listed = await simAws
      .personalize()
      .listSolutionVersions(new ListSolutionVersionsCommand({}));
    assertArrayLength(listed.solutionVersions ?? [], 0);
  });
});

import {
  CreateCampaignCommand,
  CreateDatasetGroupCommand,
  CreateDatasetCommand,
  CreateSchemaCommand,
  CreateSolutionCommand,
  CreateSolutionVersionCommand,
  DeleteDatasetGroupCommand,
  ListDatasetGroupsCommand,
} from "@aws-sdk/client-personalize";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

const schemaDocument = JSON.stringify({ type: "record", fields: [] });
const similarItemsRecipe = "arn:aws:personalize:::recipe/aws-similar-items";

describe("Personalize request validation", () => {
  it("refuses a create with no name", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a dataset group is created with no name.
    const error = await assertThrowsErrorAsync(
      async () => await simAws.personalize().createDatasetGroup({ input: {} }),
    );

    // Then Personalize says what was missing.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "dataset group needs a name");
  });

  it("refuses a name longer than Personalize allows", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a dataset group is created with a 64 character name.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .createDatasetGroup(
            new CreateDatasetGroupCommand({ name: "a".repeat(64) }),
          ),
    );

    // Then Personalize refuses it, naming the limit.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "63");
  });

  it("refuses a describe with no ARN", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a dataset group is described without naming one.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().describeDatasetGroup({ input: {} }),
    );

    // Then Personalize refuses the input rather than reporting it missing.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "required");
  });

  it("refuses a dataset with no type", async () => {
    // Given a simulated AWS holding a dataset group and a schema.
    const simAws = new SimAws();
    const group = await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "lessons" }));
    const schema = await simAws.personalize().createSchema(
      new CreateSchemaCommand({
        name: "interactions",
        schema: schemaDocument,
      }),
    );

    // When a dataset is created without one.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().createDataset({
          input: {
            name: "lesson-views",
            datasetGroupArn: group.datasetGroupArn,
            schemaArn: schema.schemaArn,
          },
        }),
    );

    // Then Personalize says what was missing.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "dataset needs a type");
  });

  it("holds a dataset group that still holds a dataset", async () => {
    // Given a simulated AWS holding a dataset in a dataset group.
    const simAws = new SimAws();
    const group = await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "lessons" }));
    const schema = await simAws.personalize().createSchema(
      new CreateSchemaCommand({
        name: "interactions",
        schema: schemaDocument,
      }),
    );
    await simAws.personalize().createDataset(
      new CreateDatasetCommand({
        name: "lesson-views",
        datasetGroupArn: group.datasetGroupArn,
        schemaArn: schema.schemaArn,
        datasetType: "Interactions",
      }),
    );

    // When the dataset group is deleted.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().deleteDatasetGroup(
          new DeleteDatasetGroupCommand({
            datasetGroupArn: group.datasetGroupArn,
          }),
        ),
    );

    // Then Personalize reports it as still in use, naming what holds it.
    assertIdentical(error.name, "ResourceInUseException");
    assertStringIncludes(error.message, "dataset(s)");
  });
});

describe("Personalize list paging", () => {
  it("refuses a page size Personalize would not serve", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a list asks for more than one page holds.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .listDatasetGroups(new ListDatasetGroupsCommand({ maxResults: 101 })),
    );

    // Then Personalize refuses it as invalid input.
    assertIdentical(error.name, "InvalidInputException");
  });

  it("refuses a token it never handed out", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a list carries on from a token that means nothing.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .listDatasetGroups(
            new ListDatasetGroupsCommand({ nextToken: "back" }),
          ),
    );

    // Then Personalize reports it as the bad token it is, which is the one
    // error its list operations declare.
    assertIdentical(error.name, "InvalidNextTokenException");
  });

  it("refuses a page size that is not a whole number", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a list asks for a fraction of a page. A fractional size would slice
    // to a fractional index and hand back a token the next call cannot use.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .listDatasetGroups({ input: { maxResults: 1.5 } }),
    );

    // Then Personalize refuses it as invalid input.
    assertIdentical(error.name, "InvalidInputException");
  });

  it("refuses a page size that is not a number at all", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a list asks for NaN results, which passes a bare range check and
    // would quietly answer with nothing.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .listDatasetGroups({ input: { maxResults: NaN } }),
    );

    // Then Personalize refuses it as invalid input.
    assertIdentical(error.name, "InvalidInputException");
  });
});

describe("Personalize domain dataset groups", () => {
  it("refuses a Next-Best-Action dataset in a domain dataset group", async () => {
    // Given a simulated AWS holding a domain dataset group and a schema.
    const simAws = new SimAws();
    const group = await simAws.personalize().createDatasetGroup(
      new CreateDatasetGroupCommand({
        name: "storefront",
        domain: "ECOMMERCE",
      }),
    );
    const schema = await simAws
      .personalize()
      .createSchema(
        new CreateSchemaCommand({ name: "actions", schema: schemaDocument }),
      );

    // When an actions dataset is added to it.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().createDataset(
          new CreateDatasetCommand({
            name: "enrolments",
            datasetGroupArn: group.datasetGroupArn,
            schemaArn: schema.schemaArn,
            datasetType: "Actions",
          }),
        ),
    );

    // Then Personalize refuses it. Next-Best-Action resources belong to a
    // custom dataset group.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "custom dataset group");
  });

  it("holds a Next-Best-Action dataset in a custom dataset group", async () => {
    // Given a simulated AWS holding a custom dataset group and a schema.
    const simAws = new SimAws();
    const group = await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "app" }));
    const schema = await simAws
      .personalize()
      .createSchema(
        new CreateSchemaCommand({ name: "actions", schema: schemaDocument }),
      );

    // When an action interactions dataset is added to it.
    const created = await simAws.personalize().createDataset(
      new CreateDatasetCommand({
        name: "enrolments",
        datasetGroupArn: group.datasetGroupArn,
        schemaArn: schema.schemaArn,
        datasetType: "Action_Interactions",
      }),
    );

    // Then it goes through, because a group with no domain is a custom one.
    assertStringIncludes(
      created.datasetArn ?? "",
      "dataset/app/ACTION_INTERACTIONS",
    );
  });
});

describe("Personalize simulator accessors", () => {
  it("finds the solution and campaign a chain built", async () => {
    // Given a simulated AWS holding a campaign on a solution.
    const simAws = new SimAws();
    const group = await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "lessons" }));
    const solution = await simAws.personalize().createSolution(
      new CreateSolutionCommand({
        name: "related-lessons",
        datasetGroupArn: group.datasetGroupArn,
        recipeArn: similarItemsRecipe,
      }),
    );
    const version = await simAws
      .personalize()
      .createSolutionVersion(
        new CreateSolutionVersionCommand({ solutionArn: solution.solutionArn }),
      );
    await simAws.personalize().createCampaign(
      new CreateCampaignCommand({
        name: "related-lessons",
        solutionVersionArn: version.solutionVersionArn,
      }),
    );

    // When a test reaches for them without going through a Command.
    const foundSolution = simAws.personalize().findSolution("related-lessons");
    const foundCampaign = simAws.personalize().findCampaign("related-lessons");

    // Then both come back, with no authorization in the way.
    assertNonNullable(foundSolution);
    assertNonNullable(foundCampaign);
    assertIdentical(foundSolution.recipeArn, similarItemsRecipe);
    assertIdentical(
      foundCampaign.solutionVersionArn,
      version.solutionVersionArn,
    );
    assertUndefined(simAws.personalize().findSolution("absent"));
    assertUndefined(simAws.personalize().findCampaign("absent"));
  });
});

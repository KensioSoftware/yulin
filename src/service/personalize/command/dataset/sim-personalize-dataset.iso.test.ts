import {
  CreateDatasetGroupCommand,
  CreateDatasetCommand,
  CreateSchemaCommand,
  DeleteDatasetCommand,
  DescribeDatasetCommand,
  ListDatasetsCommand,
} from "@aws-sdk/client-personalize";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringEndsWith,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

const schemaDocument = JSON.stringify({ type: "record", fields: [] });
const accountIdOneOnes = "111111111111";

async function givenADatasetGroupAndSchema(
  simAws: SimAws,
  datasetGroupName = "lessons",
): Promise<{ datasetGroupArn: string; schemaArn: string }> {
  const group = await simAws
    .personalize()
    .createDatasetGroup(
      new CreateDatasetGroupCommand({ name: datasetGroupName }),
    );
  const schema = await simAws.personalize().createSchema(
    new CreateSchemaCommand({
      name: `${datasetGroupName}-schema`,
      schema: schemaDocument,
    }),
  );

  assertNonNullable(group.datasetGroupArn);
  assertNonNullable(schema.schemaArn);

  return {
    datasetGroupArn: group.datasetGroupArn,
    schemaArn: schema.schemaArn,
  };
}

describe("Personalize CreateDataset", () => {
  it("names the dataset ARN after its group and type", async () => {
    // Given a simulated AWS holding a dataset group and a schema.
    const simAws = new SimAws({
      defaultAccountId: accountIdOneOnes,
      defaultRegionName: "eu-west-2",
    });
    const { datasetGroupArn, schemaArn } =
      await givenADatasetGroupAndSchema(simAws);

    // When a dataset is created.
    const created = await simAws.personalize().createDataset(
      new CreateDatasetCommand({
        name: "lesson-views",
        datasetGroupArn,
        schemaArn,
        datasetType: "Interactions",
      }),
    );

    // Then the ARN carries the group and the upper-cased type rather than the
    // name the request gave.
    assertIdentical(
      created.datasetArn,
      "arn:aws:personalize:eu-west-2:111111111111:dataset/lessons/INTERACTIONS",
    );
  });

  it("refuses a second dataset of the same type in one group", async () => {
    // Given a simulated AWS holding an interactions dataset.
    const simAws = new SimAws();
    const { datasetGroupArn, schemaArn } =
      await givenADatasetGroupAndSchema(simAws);
    await simAws.personalize().createDataset(
      new CreateDatasetCommand({
        name: "lesson-views",
        datasetGroupArn,
        schemaArn,
        datasetType: "Interactions",
      }),
    );

    // When another interactions dataset is added to that group.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().createDataset(
          new CreateDatasetCommand({
            name: "more-lesson-views",
            datasetGroupArn,
            schemaArn,
            datasetType: "Interactions",
          }),
        ),
    );

    // Then Personalize refuses it, because a group holds one of each type.
    assertIdentical(error.name, "ResourceAlreadyExistsException");
  });

  it("lets two dataset groups each hold an interactions dataset", async () => {
    // Given a simulated AWS holding two dataset groups.
    const simAws = new SimAws();
    const lessons = await givenADatasetGroupAndSchema(simAws, "lessons");
    const words = await givenADatasetGroupAndSchema(simAws, "words");

    // When each is given an interactions dataset.
    await simAws.personalize().createDataset(
      new CreateDatasetCommand({
        name: "views",
        datasetGroupArn: lessons.datasetGroupArn,
        schemaArn: lessons.schemaArn,
        datasetType: "Interactions",
      }),
    );
    const second = await simAws.personalize().createDataset(
      new CreateDatasetCommand({
        name: "views",
        datasetGroupArn: words.datasetGroupArn,
        schemaArn: words.schemaArn,
        datasetType: "Interactions",
      }),
    );

    // Then both exist, because the group is part of the dataset ARN.
    assertNonNullable(second.datasetArn);
    const listed = await simAws
      .personalize()
      .listDatasets(new ListDatasetsCommand({}));
    assertArrayLength(listed.datasets ?? [], 2);
  });

  it("refuses a dataset type Personalize has no dataset for", async () => {
    // Given a simulated AWS holding a dataset group and a schema.
    const simAws = new SimAws();
    const { datasetGroupArn, schemaArn } =
      await givenADatasetGroupAndSchema(simAws);

    // When a dataset is created with a type that does not exist.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().createDataset(
          new CreateDatasetCommand({
            name: "lesson-views",
            datasetGroupArn,
            schemaArn,
            datasetType: "Lessons",
          }),
        ),
    );

    // Then Personalize refuses it as invalid input.
    assertIdentical(error.name, "InvalidInputException");
  });

  it("refuses a dataset whose dataset group is absent", async () => {
    // Given a simulated AWS holding a schema and no dataset group.
    const simAws = new SimAws();
    const schema = await simAws.personalize().createSchema(
      new CreateSchemaCommand({
        name: "interactions",
        schema: schemaDocument,
      }),
    );

    // When a dataset names a dataset group that was never created.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().createDataset(
          new CreateDatasetCommand({
            name: "lesson-views",
            datasetGroupArn:
              "arn:aws:personalize:eu-west-2:111111111111:dataset-group/gone",
            schemaArn: schema.schemaArn,
            datasetType: "Interactions",
          }),
        ),
    );

    // Then Personalize reports the parent as missing.
    assertIdentical(error.name, "ResourceNotFoundException");
  });
});

describe("Personalize DescribeDataset", () => {
  it("reports the dataset back with its group, type and schema", async () => {
    // Given a simulated AWS holding a dataset.
    const simAws = new SimAws();
    const { datasetGroupArn, schemaArn } =
      await givenADatasetGroupAndSchema(simAws);
    const created = await simAws.personalize().createDataset(
      new CreateDatasetCommand({
        name: "lesson-views",
        datasetGroupArn,
        schemaArn,
        datasetType: "interactions",
      }),
    );

    // When it is described.
    const described = await simAws
      .personalize()
      .describeDataset(
        new DescribeDatasetCommand({ datasetArn: created.datasetArn }),
      );

    // Then it carries what created it, with the type upper-cased the way real
    // Personalize stores it.
    assertNonNullable(described.dataset);
    assertIdentical(described.dataset.datasetType, "INTERACTIONS");
    assertIdentical(described.dataset.datasetGroupArn, datasetGroupArn);
    assertIdentical(described.dataset.schemaArn, schemaArn);
    assertIdentical(described.dataset.status, "ACTIVE");
  });
});

describe("Personalize ListDatasets", () => {
  it("filters by dataset group when one is named", async () => {
    // Given a simulated AWS holding a dataset in each of two groups.
    const simAws = new SimAws();
    const lessons = await givenADatasetGroupAndSchema(simAws, "lessons");
    const words = await givenADatasetGroupAndSchema(simAws, "words");
    await simAws.personalize().createDataset(
      new CreateDatasetCommand({
        name: "views",
        datasetGroupArn: lessons.datasetGroupArn,
        schemaArn: lessons.schemaArn,
        datasetType: "Interactions",
      }),
    );
    await simAws.personalize().createDataset(
      new CreateDatasetCommand({
        name: "views",
        datasetGroupArn: words.datasetGroupArn,
        schemaArn: words.schemaArn,
        datasetType: "Interactions",
      }),
    );

    // When one group's datasets are listed.
    const listed = await simAws.personalize().listDatasets(
      new ListDatasetsCommand({
        datasetGroupArn: lessons.datasetGroupArn,
      }),
    );

    // Then only that group's dataset comes back.
    assertArrayLength(listed.datasets ?? [], 1);
    assertStringEndsWith(
      listed.datasets?.[0]?.datasetArn ?? "",
      "dataset/lessons/INTERACTIONS",
    );
  });
});

describe("Personalize DeleteDataset", () => {
  it("forgets a dataset", async () => {
    // Given a simulated AWS holding a dataset.
    const simAws = new SimAws();
    const { datasetGroupArn, schemaArn } =
      await givenADatasetGroupAndSchema(simAws);
    const created = await simAws.personalize().createDataset(
      new CreateDatasetCommand({
        name: "lesson-views",
        datasetGroupArn,
        schemaArn,
        datasetType: "Interactions",
      }),
    );

    // When it is deleted.
    await simAws
      .personalize()
      .deleteDataset(
        new DeleteDatasetCommand({ datasetArn: created.datasetArn }),
      );

    // Then nothing is left to list.
    const listed = await simAws
      .personalize()
      .listDatasets(new ListDatasetsCommand({}));
    assertArrayEmpty(listed.datasets ?? []);
  });
});

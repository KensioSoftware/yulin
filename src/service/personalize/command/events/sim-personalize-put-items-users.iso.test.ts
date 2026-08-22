import {
  CreateDatasetCommand,
  CreateDatasetGroupCommand,
  CreateSchemaCommand,
} from "@aws-sdk/client-personalize";
import {
  PutItemsCommand,
  PutUsersCommand,
} from "@aws-sdk/client-personalize-events";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

interface Datasets {
  readonly items: string;
  readonly users: string;
  readonly interactions: string;
}

async function givenTheThreeDatasets(simAws: SimAws): Promise<Datasets> {
  const group = await simAws
    .personalize()
    .createDatasetGroup(new CreateDatasetGroupCommand({ name: "catalogue" }));
  const schema = await simAws.personalize().createSchema(
    new CreateSchemaCommand({
      name: "catalogue-schema",
      schema: JSON.stringify({ type: "record", name: "Items", fields: [] }),
    }),
  );

  const created = await Promise.all(
    ["ITEMS", "USERS", "INTERACTIONS"].map(
      async (datasetType) =>
        await simAws.personalize().createDataset(
          new CreateDatasetCommand({
            name: datasetType.toLowerCase(),
            datasetGroupArn: group.datasetGroupArn,
            schemaArn: schema.schemaArn,
            datasetType,
          }),
        ),
    ),
  );
  const [items, users, interactions] = created.map(
    (dataset) => dataset.datasetArn,
  );

  assertNonNullable(items);
  assertNonNullable(users);
  assertNonNullable(interactions);

  return { items, users, interactions };
}

describe("Personalize PutItems", () => {
  it("records the items a catalogue update carries", async () => {
    // Given an Items dataset.
    const simAws = new SimAws();
    const datasets = await givenTheThreeDatasets(simAws);

    // When two items are added to it.
    await simAws.personalizeEvents().putItems(
      new PutItemsCommand({
        datasetArn: datasets.items,
        items: [
          { itemId: "entry-1042", properties: { category: "Horror|Action" } },
          { itemId: "entry-2071" },
        ],
      }),
    );

    // Then both are recorded in the order the request listed them.
    const recorded = simAws.personalize().recordedItems();
    assertArrayEquals(
      recorded.map((item) => item.itemId),
      ["entry-1042", "entry-2071"],
    );
    const [first] = recorded;
    assertNonNullable(first);
    assertIdentical(first.properties, '{"category":"Horror|Action"}');
    assertIdentical(first.datasetArn, datasets.items);
  });

  it("refuses a dataset of the wrong type", async () => {
    // Given the Interactions dataset of the same group.
    const simAws = new SimAws();
    const datasets = await givenTheThreeDatasets(simAws);

    // When items are added to it by mistake.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeEvents().putItems(
          new PutItemsCommand({
            datasetArn: datasets.interactions,
            items: [{ itemId: "entry-1042" }],
          }),
        ),
    );

    // Then Personalize refuses it rather than recording metadata nothing
    // would read.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "is a INTERACTIONS dataset");
  });

  it("refuses a dataset ARN nothing holds", async () => {
    // Given a simulated AWS with no datasets at all.
    const simAws = new SimAws();

    // When items are added to an ARN naming nothing.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeEvents().putItems(
          new PutItemsCommand({
            datasetArn:
              "arn:aws:personalize:us-east-1:000000000000:dataset/gone/ITEMS",
            items: [{ itemId: "entry-1042" }],
          }),
        ),
    );

    // Then the missing dataset is what is reported.
    assertIdentical(error.name, "ResourceNotFoundException");
  });

  it("requires an item id on every item", async () => {
    // Given an Items dataset.
    const simAws = new SimAws();
    const datasets = await givenTheThreeDatasets(simAws);

    // When an item arrives without one.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeEvents().putItems(
          new PutItemsCommand({
            datasetArn: datasets.items,
            items: [{ itemId: undefined }],
          }),
        ),
    );

    // Then it is refused as invalid input.
    assertIdentical(error.name, "InvalidInputException");
  });
});

describe("Personalize PutUsers", () => {
  it("records the users a request carries", async () => {
    // Given a Users dataset.
    const simAws = new SimAws();
    const datasets = await givenTheThreeDatasets(simAws);

    // When a user is added to it.
    await simAws.personalizeEvents().putUsers(
      new PutUsersCommand({
        datasetArn: datasets.users,
        users: [
          { userId: "visitor-7", properties: { membership: "Frequent" } },
        ],
      }),
    );

    // Then the user is recorded against that dataset.
    const [user] = simAws.personalize().recordedUsers();
    assertNonNullable(user);
    assertIdentical(user.userId, "visitor-7");
    assertIdentical(user.properties, '{"membership":"Frequent"}');
    assertIdentical(user.datasetArn, datasets.users);
  });

  it("refuses a dataset of the wrong type", async () => {
    // Given the Items dataset of the same group.
    const simAws = new SimAws();
    const datasets = await givenTheThreeDatasets(simAws);

    // When users are added to it by mistake.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeEvents().putUsers(
          new PutUsersCommand({
            datasetArn: datasets.items,
            users: [{ userId: "visitor-7" }],
          }),
        ),
    );

    // Then Personalize refuses it.
    assertIdentical(error.name, "InvalidInputException");
    assertStringIncludes(error.message, "PutUsers needs a USERS one");
  });

  it("refuses more records than one request may carry", async () => {
    // Given an Items dataset and a Users dataset.
    const simAws = new SimAws();
    const datasets = await givenTheThreeDatasets(simAws);

    // When each operation batches eleven records.
    const tooManyItems = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeEvents().putItems(
          new PutItemsCommand({
            datasetArn: datasets.items,
            items: Array.from({ length: 11 }, (_, index) => ({
              itemId: `entry-${String(index)}`,
            })),
          }),
        ),
    );
    const tooManyUsers = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalizeEvents().putUsers(
          new PutUsersCommand({
            datasetArn: datasets.users,
            users: Array.from({ length: 11 }, (_, index) => ({
              userId: `visitor-${String(index)}`,
            })),
          }),
        ),
    );

    // Then both are refused, as real Personalize refuses them at ten.
    assertIdentical(tooManyItems.name, "InvalidInputException");
    assertStringIncludes(tooManyItems.message, "items carries 11 records");
    assertIdentical(tooManyUsers.name, "InvalidInputException");
    assertStringIncludes(tooManyUsers.message, "users carries 11 records");
  });

  it("refuses an empty batch", async () => {
    // Given a Users dataset.
    const simAws = new SimAws();
    const datasets = await givenTheThreeDatasets(simAws);

    // When a request carries no users at all.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalizeEvents()
          .putUsers(
            new PutUsersCommand({ datasetArn: datasets.users, users: [] }),
          ),
    );

    // Then it is refused as invalid input.
    assertIdentical(error.name, "InvalidInputException");
  });
});

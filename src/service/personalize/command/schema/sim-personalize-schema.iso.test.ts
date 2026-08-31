import {
  CreateDatasetGroupCommand,
  CreateDatasetCommand,
  CreateSchemaCommand,
  DeleteSchemaCommand,
  DescribeSchemaCommand,
  ListSchemasCommand,
} from "@aws-sdk/client-personalize";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

const interactionsSchema = JSON.stringify({
  type: "record",
  name: "Interactions",
  fields: [
    { name: "USER_ID", type: "string" },
    { name: "ITEM_ID", type: "string" },
    { name: "TIMESTAMP", type: "long" },
  ],
});

describe("Personalize CreateSchema", () => {
  it("holds the schema document as the string it arrived as", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a schema is created.
    const created = await simAws.personalize().createSchema(
      new CreateSchemaCommand({
        name: "interactions",
        schema: interactionsSchema,
      }),
    );

    // Then describing it gives back exactly what was sent.
    const described = await simAws
      .personalize()
      .describeSchema(
        new DescribeSchemaCommand({ schemaArn: created.schemaArn }),
      );
    assertNonNullable(described.schema);
    assertIdentical(described.schema.schema, interactionsSchema);
    assertIdentical(described.schema.name, "interactions");
  });

  it("refuses a schema with no document", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a schema is created with no document.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .createSchema({ input: { name: "interactions" } }),
    );

    // Then Personalize refuses it as invalid input.
    assertIdentical(error.name, "InvalidInputException");
  });

  it("refuses a second schema of the same name", async () => {
    // Given a simulated AWS holding a schema.
    const simAws = new SimAws();
    await simAws.personalize().createSchema(
      new CreateSchemaCommand({
        name: "interactions",
        schema: interactionsSchema,
      }),
    );

    // When a second one is created with that name.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.personalize().createSchema(
          new CreateSchemaCommand({
            name: "interactions",
            schema: interactionsSchema,
          }),
        ),
    );

    // Then Personalize refuses it as one that already exists.
    assertIdentical(error.name, "ResourceAlreadyExistsException");
  });
});

describe("Personalize ListSchemas", () => {
  it("lists every schema in the region", async () => {
    // Given a simulated AWS holding two schemas.
    const simAws = new SimAws();
    await simAws
      .personalize()
      .createSchema(
        new CreateSchemaCommand({ name: "one", schema: interactionsSchema }),
      );
    await simAws
      .personalize()
      .createSchema(
        new CreateSchemaCommand({ name: "two", schema: interactionsSchema }),
      );

    // When they are listed.
    const listed = await simAws
      .personalize()
      .listSchemas(new ListSchemasCommand({}));

    // Then both come back.
    assertArrayLength(listed.schemas ?? [], 2);
  });
});

describe("Personalize DeleteSchema", () => {
  it("forgets a schema no dataset uses", async () => {
    // Given a simulated AWS holding a schema.
    const simAws = new SimAws();
    const created = await simAws.personalize().createSchema(
      new CreateSchemaCommand({
        name: "interactions",
        schema: interactionsSchema,
      }),
    );

    // When it is deleted.
    await simAws
      .personalize()
      .deleteSchema(new DeleteSchemaCommand({ schemaArn: created.schemaArn }));

    // Then nothing is left to list.
    const listed = await simAws
      .personalize()
      .listSchemas(new ListSchemasCommand({}));
    assertArrayEmpty(listed.schemas ?? []);
  });

  it("holds a schema a dataset still uses", async () => {
    // Given a simulated AWS holding a dataset built on a schema.
    const simAws = new SimAws();
    const group = await simAws
      .personalize()
      .createDatasetGroup(new CreateDatasetGroupCommand({ name: "lessons" }));
    const schema = await simAws.personalize().createSchema(
      new CreateSchemaCommand({
        name: "interactions",
        schema: interactionsSchema,
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

    // When the schema is deleted.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .personalize()
          .deleteSchema(
            new DeleteSchemaCommand({ schemaArn: schema.schemaArn }),
          ),
    );

    // Then Personalize reports it as still in use.
    assertIdentical(error.name, "ResourceInUseException");
  });
});

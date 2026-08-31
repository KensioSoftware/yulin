import {
  BatchCreatePartitionCommand,
  BatchDeletePartitionCommand,
  CreateDatabaseCommand,
  CreatePartitionCommand,
  CreateTableCommand,
  DeleteDatabaseCommand,
  DeletePartitionCommand,
  DeleteTableCommand,
  GetDatabaseCommand,
  GetDatabasesCommand,
  GetPartitionCommand,
  GetPartitionsCommand,
  GetTableCommand,
  GetTablesCommand,
  GlueClient,
} from "@aws-sdk/client-glue";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayIncludesAll,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("SimGlueSdkCommandRouter", () => {
  it("names every Command simulated Glue handles", () => {
    // Given a scoped simulated Glue.
    const simAws = new SimAws();

    // When its supported Command names are asked for.
    const names = simAws.glue().sdkCommandRouter().supportedCommandNames();

    // Then each simulated operation is routable by SDK Command name.
    assertArrayIncludesAll(names, [
      "CreateDatabaseCommand",
      "GetDatabaseCommand",
      "GetDatabasesCommand",
      "DeleteDatabaseCommand",
      "CreateTableCommand",
      "GetTableCommand",
      "GetTablesCommand",
      "DeleteTableCommand",
      "CreatePartitionCommand",
      "BatchCreatePartitionCommand",
      "GetPartitionCommand",
      "GetPartitionsCommand",
      "DeletePartitionCommand",
      "BatchDeletePartitionCommand",
    ]);
  });

  it("has no route for a Command simulated Glue does not handle", () => {
    // Given a scoped simulated Glue.
    const simAws = new SimAws();

    // When a Command outside the simulated surface is asked for.
    const route = simAws
      .glue()
      .sdkCommandRouter()
      .route("CreateCrawlerCommand");

    // Then there is no route for it.
    assertUndefined(route);
  });
});

describe("Glue SDK interception", () => {
  it("routes an intercepted GlueClient to simulated Glue", async () => {
    // Given an intercepted Glue SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(GlueClient);

    const client = new GlueClient({ region: "eu-west-2" });

    // When ordinary SDK code creates a database and a table in it.
    await client.send(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );
    await client.send(
      new CreateTableCommand({
        DatabaseName: "site_logs",
        TableInput: {
          Name: "access_logs",
          Parameters: { "projection.enabled": "true" },
        },
      }),
    );

    const database = await client.send(
      new GetDatabaseCommand({ Name: "site_logs" }),
    );
    const table = await client.send(
      new GetTableCommand({ DatabaseName: "site_logs", Name: "access_logs" }),
    );

    // Then both come back from the simulation.
    assertIdentical(database.Database?.Name, "site_logs");
    assertIdentical(table.Table?.Name, "access_logs");
    assertIdentical(table.Table.Parameters?.["projection.enabled"], "true");
  });

  it("lists and deletes through an intercepted client", async () => {
    // Given an intercepted client holding a database and two tables.
    using simSdk = new SimSdk();
    simSdk.intercept(GlueClient);

    const client = new GlueClient({ region: "eu-west-2" });

    await client.send(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );
    await client.send(
      new CreateTableCommand({
        DatabaseName: "site_logs",
        TableInput: { Name: "access_logs" },
      }),
    );
    await client.send(
      new CreateTableCommand({
        DatabaseName: "site_logs",
        TableInput: { Name: "error_logs" },
      }),
    );

    // When they are listed and one table is deleted.
    const databases = await client.send(new GetDatabasesCommand({}));
    const before = await client.send(
      new GetTablesCommand({ DatabaseName: "site_logs" }),
    );

    await client.send(
      new DeleteTableCommand({
        DatabaseName: "site_logs",
        Name: "error_logs",
      }),
    );

    const after = await client.send(
      new GetTablesCommand({ DatabaseName: "site_logs" }),
    );

    // Then the listings report what the catalog holds at each point.
    assertArrayEquals(
      databases.DatabaseList?.map((database) => database.Name),
      ["site_logs"],
    );
    assertArrayEquals(
      before.TableList?.map((table) => table.Name),
      ["access_logs", "error_logs"],
    );
    assertArrayEquals(
      after.TableList?.map((table) => table.Name),
      ["access_logs"],
    );

    // And deleting the database takes its remaining table with it.
    await client.send(new DeleteDatabaseCommand({ Name: "site_logs" }));

    const remaining = await client.send(new GetDatabasesCommand({}));

    assertArrayEmpty(remaining.DatabaseList ?? []);
  });

  it("registers and reads partitions through an intercepted client", async () => {
    // Given an intercepted client holding a table partitioned by day.
    using simSdk = new SimSdk();
    simSdk.intercept(GlueClient);

    const client = new GlueClient({ region: "eu-west-2" });

    await client.send(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );
    await client.send(
      new CreateTableCommand({
        DatabaseName: "site_logs",
        TableInput: {
          Name: "access_logs",
          PartitionKeys: [{ Name: "day", Type: "string" }],
        },
      }),
    );

    // When ordinary SDK code registers three days, reads one back and removes
    // two of them.
    await client.send(
      new BatchCreatePartitionCommand({
        DatabaseName: "site_logs",
        TableName: "access_logs",
        PartitionInputList: [
          { Values: ["2026-08-24"] },
          { Values: ["2026-08-25"] },
        ],
      }),
    );
    await client.send(
      new CreatePartitionCommand({
        DatabaseName: "site_logs",
        TableName: "access_logs",
        PartitionInput: {
          Values: ["2026-08-26"],
          StorageDescriptor: { Location: "s3://site-logs/day=2026-08-26/" },
        },
      }),
    );

    const one = await client.send(
      new GetPartitionCommand({
        DatabaseName: "site_logs",
        TableName: "access_logs",
        PartitionValues: ["2026-08-26"],
      }),
    );

    await client.send(
      new DeletePartitionCommand({
        DatabaseName: "site_logs",
        TableName: "access_logs",
        PartitionValues: ["2026-08-24"],
      }),
    );
    await client.send(
      new BatchDeletePartitionCommand({
        DatabaseName: "site_logs",
        TableName: "access_logs",
        PartitionsToDelete: [{ Values: ["2026-08-25"] }],
      }),
    );

    const left = await client.send(
      new GetPartitionsCommand({
        DatabaseName: "site_logs",
        TableName: "access_logs",
      }),
    );

    // Then each command reached the simulation.
    assertIdentical(
      one.Partition?.StorageDescriptor?.Location,
      "s3://site-logs/day=2026-08-26/",
    );
    assertArrayEquals(
      left.Partitions?.map((partition) => partition.Values?.[0]),
      ["2026-08-26"],
    );
  });
});

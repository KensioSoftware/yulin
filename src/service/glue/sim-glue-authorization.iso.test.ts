import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateDatabaseCommand,
  CreatePartitionCommand,
  CreateTableCommand,
  DeleteDatabaseCommand,
  GetPartitionsCommand,
  GetTableCommand,
} from "@aws-sdk/client-glue";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { SimIamAccessDenied } from "../iam/error/sim-iam.error.js";

const accountId = "111111111111";
const caller = {
  kind: "arn" as const,
  arn: `arn:aws:iam::${accountId}:role/ReportingRole`,
};

const catalogArn = `arn:aws:glue:us-east-1:${accountId}:catalog`;
const databaseArn = `arn:aws:glue:us-east-1:${accountId}:database/site_logs`;
const tableArn = `arn:aws:glue:us-east-1:${accountId}:table/site_logs/access_logs`;

/** A catalog holding one table, which is what the policies below name. */
function catalogWithTable(simAws: SimAws): void {
  const glue = simAws.glue();

  glue.createDatabase(
    new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
  );
  glue.createTable(
    new CreateTableCommand({
      DatabaseName: "site_logs",
      TableInput: {
        Name: "access_logs",
        PartitionKeys: [{ Name: "day", Type: "string" }],
      },
    }),
  );
}

/** A Role allowed one action over the resources named. */
async function roleAllowing(
  simAws: SimAws,
  action: string,
  resource: readonly string[],
): Promise<void> {
  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "ReportingRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "ReportingRole",
      PolicyName: "ReadAccessLogs",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Action: action, Resource: resource }],
      }),
    }),
  );
}

describe("SimGlue authorization", () => {
  it("lets a caller whose policy names the table and its ancestors read it", async () => {
    // Given a role allowed to read one table, over the catalog, the database
    // and the table, which is what real Glue needs.
    const simAws = new SimAws({ defaultAccountId: accountId });

    catalogWithTable(simAws);
    await roleAllowing(simAws, "glue:GetTable", [
      catalogArn,
      databaseArn,
      tableArn,
    ]);

    // When the role reads that table.
    const { Table } = simAws
      .glue()
      .getTable(
        new GetTableCommand({ DatabaseName: "site_logs", Name: "access_logs" }),
        { caller },
      );

    // Then it comes back.
    assertIdentical(Table.Name, "access_logs");
  });

  it("refuses a policy naming the table without its ancestors", async () => {
    // Given a role allowed to read the table ARN alone. Real Glue denies this,
    // because an operation on a Data Catalog resource needs permission on the
    // resource and on every ancestor of it.
    const simAws = new SimAws({ defaultAccountId: accountId });

    catalogWithTable(simAws);
    await roleAllowing(simAws, "glue:GetTable", [tableArn]);

    // When the role reads that table.
    const error = assertThrowsError(() => {
      simAws.glue().getTable(
        new GetTableCommand({
          DatabaseName: "site_logs",
          Name: "access_logs",
        }),
        { caller },
      );
    });

    // Then it is refused, naming the outermost resource the policy left out.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, catalogArn);
  });

  it("refuses a policy naming the catalog without the database", async () => {
    // Given a role allowed the action over the catalog alone.
    const simAws = new SimAws({ defaultAccountId: accountId });

    catalogWithTable(simAws);
    await roleAllowing(simAws, "glue:GetTable", [catalogArn]);

    // When the role reads a table.
    const error = assertThrowsError(() => {
      simAws.glue().getTable(
        new GetTableCommand({
          DatabaseName: "site_logs",
          Name: "access_logs",
        }),
        { caller },
      );
    });

    // Then it is refused at the database, which is the next resource down.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, databaseArn);
  });

  it("refuses a caller whose policy leaves the action out", async () => {
    // Given a role that may read a table and nothing else.
    const simAws = new SimAws({ defaultAccountId: accountId });

    catalogWithTable(simAws);
    await roleAllowing(simAws, "glue:GetTable", [
      catalogArn,
      databaseArn,
      tableArn,
    ]);

    // When it creates a table.
    const error = assertThrowsError(() => {
      simAws.glue().createTable(
        new CreateTableCommand({
          DatabaseName: "site_logs",
          TableInput: { Name: "error_logs" },
        }),
        { caller },
      );
    });

    // Then IAM refuses it, before the catalog is reached.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, "glue:CreateTable");
  });

  it("refuses deleting a database the policy covers without its tables", async () => {
    // Given a role allowed to delete the database and its ancestors, and
    // nothing on the table inside it. A delete needs the children too.
    const simAws = new SimAws({ defaultAccountId: accountId });

    catalogWithTable(simAws);
    await roleAllowing(simAws, "glue:DeleteDatabase", [
      catalogArn,
      databaseArn,
    ]);

    // When the role deletes the database.
    const error = assertThrowsError(() => {
      simAws
        .glue()
        .deleteDatabase(new DeleteDatabaseCommand({ Name: "site_logs" }), {
          caller,
        });
    });

    // Then it is refused, naming the table that would have gone with it.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, tableArn);
  });

  it("deletes a database when the policy covers its tables too", async () => {
    // Given the same role, with the table added to its policy.
    const simAws = new SimAws({ defaultAccountId: accountId });

    catalogWithTable(simAws);
    await roleAllowing(simAws, "glue:DeleteDatabase", [
      catalogArn,
      databaseArn,
      tableArn,
    ]);

    // When the role deletes the database.
    simAws
      .glue()
      .deleteDatabase(new DeleteDatabaseCommand({ Name: "site_logs" }), {
        caller,
      });

    // Then it goes, and takes its table with it.
    assertArrayLength(simAws.glue().allDatabases(), 0);
  });

  it("lets a partition command through on the table's own ARN", async () => {
    // Given a role allowed to register partitions over the catalog, the
    // database and the table. A partition has no ARN of its own, so the table
    // is what a real Glue policy grants this on.
    const simAws = new SimAws({ defaultAccountId: accountId });

    catalogWithTable(simAws);
    await roleAllowing(simAws, "glue:CreatePartition", [
      catalogArn,
      databaseArn,
      tableArn,
    ]);

    // When the role registers a partition.
    simAws.glue().createPartition(
      new CreatePartitionCommand({
        DatabaseName: "site_logs",
        TableName: "access_logs",
        PartitionInput: { Values: ["2026-08-26"] },
      }),
      { caller },
    );

    // Then it is registered.
    assertArrayLength(
      simAws.glue().partitionsInTable("site_logs", "access_logs"),
      1,
    );
  });

  it("refuses a partition command whose policy leaves the catalog out", async () => {
    // Given a role allowed to list partitions on the table ARN alone.
    const simAws = new SimAws({ defaultAccountId: accountId });

    catalogWithTable(simAws);
    await roleAllowing(simAws, "glue:GetPartitions", [tableArn]);

    // When the role lists the table's partitions.
    const error = assertThrowsError(() => {
      simAws.glue().getPartitions(
        new GetPartitionsCommand({
          DatabaseName: "site_logs",
          TableName: "access_logs",
        }),
        { caller },
      );
    });

    // Then it is refused at the catalog, as a table read is.
    assertInstanceOf(error, SimIamAccessDenied);
    assertStringIncludes(error.message, catalogArn);
  });
});

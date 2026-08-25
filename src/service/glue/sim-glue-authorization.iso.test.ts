import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateDatabaseCommand,
  CreateTableCommand,
  GetTableCommand,
} from "@aws-sdk/client-glue";
import {
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

/**
 * A Role that may read one table and nothing else in the catalog.
 */
async function reportingRole(simAws: SimAws): Promise<void> {
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
        Statement: [
          {
            Effect: "Allow",
            Action: "glue:GetTable",
            Resource: `arn:aws:glue:us-east-1:${accountId}:table/site_logs/access_logs`,
          },
        ],
      }),
    }),
  );
}

describe("SimGlue authorization", () => {
  it("lets a caller read the table its policy names", async () => {
    // Given a catalog holding a table, and a role allowed to read that table.
    const simAws = new SimAws({ defaultAccountId: accountId });
    const glue = simAws.glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );
    glue.createTable(
      new CreateTableCommand({
        DatabaseName: "site_logs",
        TableInput: { Name: "access_logs" },
      }),
    );

    await reportingRole(simAws);

    // When the role reads that table.
    const { Table } = glue.getTable(
      new GetTableCommand({
        DatabaseName: "site_logs",
        Name: "access_logs",
      }),
      { caller },
    );

    // Then it comes back.
    assertIdentical(Table.Name, "access_logs");
  });

  it("refuses a caller whose policy leaves the action out", async () => {
    // Given the same role, which may read a table and nothing else.
    const simAws = new SimAws({ defaultAccountId: accountId });
    const glue = simAws.glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );

    await reportingRole(simAws);

    // When it creates a table.
    const error = assertThrowsError(() => {
      glue.createTable(
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

  it("refuses a caller reading a table outside its policy", async () => {
    // Given a catalog holding a second table the role's policy leaves out.
    const simAws = new SimAws({ defaultAccountId: accountId });
    const glue = simAws.glue();

    glue.createDatabase(
      new CreateDatabaseCommand({ DatabaseInput: { Name: "site_logs" } }),
    );
    glue.createTable(
      new CreateTableCommand({
        DatabaseName: "site_logs",
        TableInput: { Name: "error_logs" },
      }),
    );

    await reportingRole(simAws);

    // When the role reads that other table.
    const error = assertThrowsError(() => {
      glue.getTable(
        new GetTableCommand({
          DatabaseName: "site_logs",
          Name: "error_logs",
        }),
        { caller },
      );
    });

    // Then it is refused, because a table ARN names the table.
    assertInstanceOf(error, SimIamAccessDenied);
  });
});

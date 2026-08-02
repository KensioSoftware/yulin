import { UpdateTableCommand } from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simDynamoDbCreatedTableFactory } from "../../table/sim-dynamodb-created-table.factory.js";

/**
 * A Role a caller can be, trusted by the Account it is in.
 */
async function roleArn(simAws: SimAws, roleName: string): Promise<string> {
  const created = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  return created.Role.Arn;
}

describe("DynamoDB UpdateTableCommand IAM authorization", () => {
  it("allows a Role whose policy permits dynamodb:UpdateTable", async () => {
    // Given a Role allowed to update the table by its ARN.
    const simAws = new SimAws();
    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "orders" },
      simAws,
    );
    const arn = await roleArn(simAws, "TableAdmin");

    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "TableAdmin",
        PolicyName: "UpdateOrdersPolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "dynamodb:UpdateTable",
            Resource: table.arn,
          },
        }),
      }),
    );

    // When the Role updates the table.
    const updated = await simAws.dynamoDb().updateTable(
      new UpdateTableCommand({
        TableName: "orders",
        DeletionProtectionEnabled: true,
      }),
      { caller: { kind: "arn", arn } },
    );

    // Then the update goes through.
    assertTrue(updated.TableDescription?.DeletionProtectionEnabled);
  });

  it("denies a Role whose policy does not permit it", async () => {
    // Given a Role with no DynamoDB permissions at all.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make({ tableName: "orders" }, simAws);
    const arn = await roleArn(simAws, "Reader");

    // When it tries to update the table, then it is denied.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.dynamoDb().updateTable(
        new UpdateTableCommand({
          TableName: "orders",
          DeletionProtectionEnabled: true,
        }),
        { caller: { kind: "arn", arn } },
      );
    });

    assertInstanceOf(error, SimIamAccessDenied);
  });
});

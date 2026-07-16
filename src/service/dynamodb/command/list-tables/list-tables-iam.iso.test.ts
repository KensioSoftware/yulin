import {
  CreateTableCommand,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimDynamoDb } from "../../sim-dynamodb.js";

describe("DynamoDB ListTablesCommand IAM authorization", () => {
  it("allows the default Account root caller", async () => {
    // Given an Account and Region-scoped DynamoDB service with a table.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simDynamoDb = simAws.account(accountId).region(region).dynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "RootTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    // When ListTables is called without an explicit caller.
    const output = await simDynamoDb.listTables(new ListTablesCommand());

    // Then IAM defaults to Account root and DynamoDB returns the table listing.
    assertArrayLength(output.TableNames, 1);
    assertIdentical(output.TableNames[0], "RootTable");
  });

  it("allows a Role when its policy permits dynamodb:ListTables", async () => {
    // Given a Role allowed to list DynamoDB tables.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simDynamoDb = simAws.account(accountId).region(region).dynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "ListedTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TableLister",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = createRoleOutput.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "TableLister",
        PolicyName: "ListTablesPolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "dynamodb:ListTables",
            Resource: "*",
          },
        }),
      }),
    );

    // When the Role lists tables.
    const output = await simDynamoDb.listTables(new ListTablesCommand(), {
      caller: { kind: "arn", arn: roleArn },
    });

    // Then IAM allows the request and DynamoDB returns the table listing.
    assertArrayLength(output.TableNames, 1);
    assertIdentical(output.TableNames[0], "ListedTable");
  });

  it("implicitly denies a Role with no matching policy", async () => {
    // Given a Role with no DynamoDB permissions.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simDynamoDb = simAws.account(accountId).region(region).dynamoDb();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "NoPermissionsRole",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = createRoleOutput.Role.Arn;

    // When the Role attempts to list tables.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.listTables(new ListTablesCommand(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then IAM implicitly denies the request.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:ListTables");
    assertIdentical(error.resource, "*");
  });

  it("lets an explicit Deny override an Allow", async () => {
    // Given a Role with both Allow and Deny statements for ListTables.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simDynamoDb = simAws.account(accountId).region(region).dynamoDb();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DeniedTableLister",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = createRoleOutput.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "DeniedTableLister",
        PolicyName: "ConflictingListTablesPolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "dynamodb:ListTables",
              Resource: "*",
            },
            {
              Effect: "Deny",
              Action: "dynamodb:ListTables",
              Resource: "*",
            },
          ],
        }),
      }),
    );

    // When the Role attempts to list tables.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.listTables(new ListTablesCommand(), {
        caller: { kind: "arn", arn: roleArn },
      }),
    );

    // Then the explicit Deny wins and reports the IAM action and resource.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(
      error.message,
      `User: ${roleArn} is not authorized to perform: dynamodb:ListTables on resource: *`,
    );
  });

  it("does not apply the Account root fallback to an anonymous caller", async () => {
    // Given an Account and Region-scoped DynamoDB service.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simDynamoDb = simAws.account(accountId).region(region).dynamoDb();

    // When an explicitly anonymous caller attempts to list tables.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.listTables(new ListTablesCommand(), {
        caller: { kind: "anonymous" },
      }),
    );

    // Then IAM preserves anonymity and returns an access-denied response.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);
  });

  it("uses allow-all authorization when SimDynamoDb is instantiated directly", async () => {
    // Given a directly constructed DynamoDB service with no IAM implementation supplied.
    const simDynamoDb = new SimDynamoDb();

    await simDynamoDb.createTable(
      new CreateTableCommand({
        TableName: "StandaloneTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    // When an anonymous caller lists tables through the standalone service.
    const output = await simDynamoDb.listTables(new ListTablesCommand(), {
      caller: { kind: "anonymous" },
    });

    // Then the allow-all fallback permits the request and DynamoDB returns its state.
    assertArrayLength(output.TableNames, 1);
    assertIdentical(output.TableNames[0], "StandaloneTable");
  });
});

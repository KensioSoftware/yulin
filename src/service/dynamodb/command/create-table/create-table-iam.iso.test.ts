import { CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { makeAwsRegionName } from "../../../aws/sim-aws-region.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimDynamoDb as SimDynamoDatabase } from "../../sim-dynamodb.js";

describe("DynamoDB CreateTableCommand IAM authorization", () => {
  it("allows the default Account root caller", async () => {
    // Given an Account and Region-scoped DynamoDB service.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simDynamoDatabase = simAws
      .account(accountId)
      .region(region)
      .dynamoDb();

    // When CreateTable is called without an explicit caller.
    const output = await simDynamoDatabase.createTable(
      new CreateTableCommand({
        TableName: "RootTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );

    // Then IAM defaults to Account root and DynamoDB creates the table.
    assertIdentical(output.TableDescription?.TableName, "RootTable");
  });

  it("allows a Role when its policy permits dynamodb:CreateTable on the table ARN", async () => {
    // Given a Role allowed to create a specific DynamoDB table.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simDynamoDatabase = simAws
      .account(accountId)
      .region(region)
      .dynamoDb();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "TableCreator",
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
        RoleName: "TableCreator",
        PolicyName: "CreateTablePolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "dynamodb:CreateTable",
            Resource: `arn:aws:dynamodb:${region}:${accountId}:table/AllowedTable`,
          },
        }),
      }),
    );

    // When the Role creates the table it has permission for.
    const output = await simDynamoDatabase.createTable(
      new CreateTableCommand({
        TableName: "AllowedTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
      { caller: { kind: "arn", arn: roleArn } },
    );

    // Then IAM allows the request and DynamoDB creates the table.
    assertIdentical(output.TableDescription?.TableName, "AllowedTable");
  });

  it("implicitly denies a Role with no matching policy", async () => {
    // Given a Role with no DynamoDB permissions.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simDynamoDatabase = simAws
      .account(accountId)
      .region(region)
      .dynamoDb();

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

    // When the Role attempts to create a table.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "DeniedTable",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
        }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then IAM implicitly denies the request.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "dynamodb:CreateTable");
  });

  it("lets an explicit Deny override an Allow", async () => {
    // Given a Role with both Allow and Deny statements for CreateTable.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simDynamoDatabase = simAws
      .account(accountId)
      .region(region)
      .dynamoDb();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "DeniedTableCreator",
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
        RoleName: "DeniedTableCreator",
        PolicyName: "ConflictingTablePolicy",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "dynamodb:CreateTable",
              Resource: "*",
            },
            {
              Effect: "Deny",
              Action: "dynamodb:CreateTable",
              Resource: "*",
            },
          ],
        }),
      }),
    );

    // When the Role attempts to create a table.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "ExplicitlyDeniedTable",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
        }),
        { caller: { kind: "arn", arn: roleArn } },
      ),
    );

    // Then the explicit Deny wins and reports the IAM action.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(
      error.message,
      `User: ${roleArn} is not authorized to perform: dynamodb:CreateTable on resource: arn:aws:dynamodb:${region}:${accountId}:table/ExplicitlyDeniedTable`,
    );
  });

  it("does not apply the Account root fallback to an anonymous caller", async () => {
    // Given an Account and Region-scoped DynamoDB service.
    const accountId = makeSimAwsAccountId();
    const region = makeAwsRegionName();
    const simAws = new SimAws();
    const simDynamoDatabase = simAws
      .account(accountId)
      .region(region)
      .dynamoDb();

    // When an explicitly anonymous caller attempts to create a table.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDatabase.createTable(
        new CreateTableCommand({
          TableName: "AnonymousTable",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
        }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then IAM preserves anonymity and returns an access-denied response.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);
  });

  it("uses allow-all authorization when SimDynamoDb is instantiated directly", async () => {
    // Given a directly constructed DynamoDB service with no IAM implementation supplied.
    const simDynamoDatabase = new SimDynamoDatabase();

    // When an anonymous caller creates a table through the standalone service.
    const output = await simDynamoDatabase.createTable(
      new CreateTableCommand({
        TableName: "StandaloneTable",
        KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
        AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
      { caller: { kind: "anonymous" } },
    );

    // Then the allow-all fallback permits the request and DynamoDB creates the table.
    assertIdentical(output.TableDescription?.TableName, "StandaloneTable");
  });
});

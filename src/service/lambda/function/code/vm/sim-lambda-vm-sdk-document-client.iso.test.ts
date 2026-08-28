import { CreateTableCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../../iam/policy/sim-iam-policy-document.factory.js";
import type { SimLambda } from "../../../sim-lambda.js";
import { makeLambdaCodeZip } from "../make-lambda-code-zip.js";

/**
 * A handler writing one order through the document client the AWS SDK
 * documentation builds, whose static factory constructs the client itself
 * rather than through the class the function code holds.
 */
const factoryHandlerSource = `
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

exports.handler = async (event) => {
  const documents = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  await documents.send(
    new PutCommand({
      TableName: event.tableName,
      Item: { orderId: event.orderId, total: 42 },
    }),
  );
  return event.orderId;
};
`;

/**
 * A handler writing one order through each of the other two client shapes:
 * the document client constructed directly, and the plain client.
 */
const constructedHandlerSource = `
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

exports.handler = async (event) => {
  const client = new DynamoDBClient({});
  const documents = new DynamoDBDocumentClient(client);
  await documents.send(
    new PutCommand({
      TableName: event.tableName,
      Item: { orderId: "constructed", total: 1 },
    }),
  );
  await client.send(
    new PutItemCommand({
      TableName: event.tableName,
      Item: { orderId: { S: "plain" }, total: { N: "2" } },
    }),
  );
  return "both";
};
`;

function parsePayload(payload: Uint8Array | undefined): unknown {
  assertNonNullable(payload);
  return JSON.parse(Buffer.from(payload).toString()) as unknown;
}

/**
 * A simulation holding an orders table, and a role that may write to it when
 * the write permission is granted.
 */
async function simAwsWithOrders(
  writable: boolean,
): Promise<{ simAws: SimAws; simLambda: SimLambda; roleArn: string }> {
  const simAws = new SimAws();
  const creation = await simAws.dynamoDb().createTable(
    new CreateTableCommand({
      TableName: "orders",
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  const tableArn = creation.TableDescription?.TableArn;
  assertNonNullable(tableArn);

  const roleCreation = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "OrderWriterRole",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  if (writable) {
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "OrderWriterRole",
        PolicyName: "WriteOrders",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "dynamodb:PutItem", Resource: tableArn },
        }),
      }),
    );
  }

  return { simAws, simLambda: simAws.lambda(), roleArn: roleCreation.Role.Arn };
}

async function orderTotal(
  simAws: SimAws,
  orderId: string,
): Promise<string | undefined> {
  const read = await simAws.dynamoDb().getItem(
    new GetItemCommand({
      TableName: "orders",
      Key: { orderId: { S: orderId } },
    }),
  );
  return read.Item?.["total"]?.N;
}

describe("Sim Lambda function code using the DynamoDB document client", () => {
  it("writes to sim DynamoDB through a document client built by from", async () => {
    // Given a function that builds its document client with the static
    // factory, and a role allowed to write the table.
    const { simAws, simLambda, roleArn } = await simAwsWithOrders(true);
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "order-writer",
        Role: roleArn,
        Handler: "index.handler",
        Code: { ZipFile: makeLambdaCodeZip(factoryHandlerSource) },
      }),
    );

    // When the function is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "order-writer",
        Payload: JSON.stringify({ tableName: "orders", orderId: "order-1" }),
      }),
    );

    // Then the write reached the simulated table as the execution role.
    assertIdentical(output.StatusCode, 200);
    assertUndefined(output.FunctionError);
    assertIdentical(parsePayload(output.Payload), "order-1");
    assertIdentical(await orderTotal(simAws, "order-1"), "42");

    await simAws.backgroundTasksComplete();
  });

  it("denies the document client write the execution role cannot make", async () => {
    // Given the same function with a role holding no DynamoDB permissions.
    const { simAws, simLambda, roleArn } = await simAwsWithOrders(false);
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "denied-order-writer",
        Role: roleArn,
        Handler: "index.handler",
        Code: { ZipFile: makeLambdaCodeZip(factoryHandlerSource) },
      }),
    );

    // When the function is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "denied-order-writer",
        Payload: JSON.stringify({ tableName: "orders", orderId: "order-2" }),
      }),
    );

    // Then simulated IAM denied the write, so the factory client is
    // authorized like any other.
    assertIdentical(output.FunctionError, "Unhandled");
    const errorDocument = parsePayload(output.Payload) as {
      errorMessage: string;
    };
    assertStringIncludes(errorDocument.errorMessage, "dynamodb:PutItem");
    assertUndefined(await orderTotal(simAws, "order-2"));

    await simAws.backgroundTasksComplete();
  });

  it("keeps the constructed document client and the plain client writing", async () => {
    // Given a function writing through both of the shapes the construct trap
    // already sees.
    const { simAws, simLambda, roleArn } = await simAwsWithOrders(true);
    await simLambda.createFunction(
      new CreateFunctionCommand({
        FunctionName: "both-writers",
        Role: roleArn,
        Handler: "index.handler",
        Code: { ZipFile: makeLambdaCodeZip(constructedHandlerSource) },
      }),
    );

    // When the function is invoked.
    const output = await simLambda.invoke(
      new InvokeCommand({
        FunctionName: "both-writers",
        Payload: JSON.stringify({ tableName: "orders" }),
      }),
    );

    // Then both writes reached the simulated table.
    assertUndefined(output.FunctionError);
    assertIdentical(await orderTotal(simAws, "constructed"), "1");
    assertIdentical(await orderTotal(simAws, "plain"), "2");

    await simAws.backgroundTasksComplete();
  });
});

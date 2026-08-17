import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { build } from "esbuild";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../../iam/policy/sim-iam-policy-document.factory.js";
import { makeLambdaCodeZip } from "../make-lambda-code-zip.js";

/**
 * A handler that reads DynamoDB with an SDK client it constructs itself, with
 * no endpoint or credentials configured, exactly as a deployed one does.
 */
const readItemHandlerSource = `
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const dynamoDb = new DynamoDBClient({});

export const handler = async (event: { orderId: string }) => {
  const output = await dynamoDb.send(
    new GetItemCommand({
      TableName: "orders",
      Key: { orderId: { S: event.orderId } },
    }),
  );

  return { total: output.Item?.total?.N };
};
`;

/**
 * A handler reading an S3 object, which is the same shape of call to a service
 * whose requests carry no operation header.
 */
const readObjectHandlerSource = `
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

export const handler = async () => {
  await s3.send(new GetObjectCommand({ Bucket: "data", Key: "greeting.txt" }));

  return "unreachable";
};
`;

describe("sim Lambda vm code with a bundled AWS SDK", () => {
  it("reads simulated DynamoDB from a handler that bundles the SDK", async () => {
    // Given a simulated table holding an order.
    const simAws = new SimAws();
    await simAws.dynamoDb().createTable(
      new CreateTableCommand({
        TableName: "orders",
        AttributeDefinitions: [
          { AttributeName: "orderId", AttributeType: "S" },
        ],
        KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-1" }, total: { N: "42" } },
      }),
    );

    // And an execution role allowed to read it.
    const roleArn = await readerRoleArn(simAws);

    // And a function whose deployment package bundles the SDK, as a CDK
    // NodejsFunction with no external modules produces.
    const zipFile = makeLambdaCodeZip(await bundle(readItemHandlerSource));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "reader",
        Role: roleArn,
        Handler: "index.handler",
        Code: { ZipFile: zipFile },
      }),
    );

    // When the function is invoked.
    const output = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "reader",
        Payload: JSON.stringify({ orderId: "order-1" }),
      }),
    );

    // Then the bundled SDK reached the simulated table rather than failing to
    // find credentials for the real one.
    assertUndefined(output.FunctionError);
    assertIdentical(payload(output.Payload), '{"total":"42"}');

    await simAws.backgroundTasksComplete();
  });

  it("reports a service whose requests cannot be routed", async () => {
    // Given a function bundling an SDK client for a service that does not use
    // the AWS JSON protocol.
    const simAws = new SimAws();
    const zipFile = makeLambdaCodeZip(await bundle(readObjectHandlerSource));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "object-reader",
        Role: "arn:aws:iam::111111111111:role/ObjectReaderRole",
        Handler: "index.handler",
        Code: { ZipFile: zipFile },
      }),
    );

    // When the function is invoked.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "object-reader" }));

    // Then the failure names the service and what to do about it, rather than
    // reporting missing credentials or hanging on an endpoint.
    assertIdentical(output.FunctionError, "Unhandled");
    const errorMessage = payload(output.Payload);
    assertStringIncludes(errorMessage, "request to s3");
    assertStringIncludes(errorMessage, "AWS JSON protocol");
    assertStringIncludes(errorMessage, "leaving the SDK out");

    await simAws.backgroundTasksComplete();
  });
});

/**
 * Create an execution role allowed to read the table, so what the handler does
 * is authorized as the role rather than as anything ambient.
 */
async function readerRoleArn(simAws: SimAws): Promise<string> {
  const creation = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "ReaderRole",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "ReaderRole",
      PolicyName: "ReadOrders",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Action: "dynamodb:GetItem",
          Resource: "arn:aws:dynamodb:*:*:table/orders",
        },
      }),
    }),
  );

  return creation.Role.Arn;
}

function payload(payloadBytes: Uint8Array | undefined): string {
  assertNonNullable(payloadBytes);

  return Buffer.from(payloadBytes).toString();
}

/**
 * Bundle a handler into one CommonJS module with its dependencies inlined, as
 * a deployment package build with no external modules produces.
 */
async function bundle(source: string): Promise<string> {
  const bundled = await build({
    stdin: {
      contents: source,
      loader: "ts",
      resolveDir: import.meta.dirname,
      sourcefile: "index.ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    target: "node24",
    format: "cjs",
  });

  const output = bundled.outputFiles[0];
  assertNonNullable(output);

  return output.text;
}

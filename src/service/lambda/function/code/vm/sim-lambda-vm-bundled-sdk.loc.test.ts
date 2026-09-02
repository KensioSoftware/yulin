import { faker } from "@faker-js/faker";
import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { build } from "esbuild";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
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
 * A handler reading an S3 Object, which is the same shape of call to a service
 * whose requests carry no operation header.
 *
 * It reports whatever the SDK gave it, an Object or an error. Either one can
 * then be asserted on.
 */
const readObjectHandlerSource = `
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

export const handler = async (event: { bucket: string; key: string }) => {
  try {
    const output = await s3.send(
      new GetObjectCommand({ Bucket: event.bucket, Key: event.key }),
    );

    return {
      body: await output.Body?.transformToString(),
      contentType: output.ContentType,
      eTag: output.ETag,
    };
  } catch (error) {
    return { errorName: (error as Error).name };
  }
};
`;

/**
 * A handler calling a service the simulation still cannot read a serialized
 * request for, since SES states its operation in the method and path and has
 * no endpoint of its own here.
 */
const sendEmailHandlerSource = `
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const ses = new SESv2Client({});

export const handler = async () => {
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: "orders@example.com",
      Destination: { ToAddresses: ["customer@example.com"] },
      Content: { Simple: { Subject: { Data: "Hello" }, Body: {} } },
    }),
  );

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
    const roleArn = await executionRoleArn(simAws, {
      roleName: "ItemReaderRole",
      action: "dynamodb:GetItem",
      resource: "arn:aws:dynamodb:*:*:table/orders",
    });

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

  it("reads simulated S3 from a handler that bundles the SDK", async () => {
    // Given a simulated Bucket holding an Object.
    const simAws = new SimAws();
    const bucketName = faker.string.alpha({ length: 12, casing: "lower" });
    const objectKey = `${faker.word.noun()}/greeting.txt`;
    const greeting = faker.lorem.sentence();
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    const upload = await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: greeting,
        ContentType: "text/plain",
      }),
    );

    // And a function bundling an S3 client, whose execution Role may read it.
    const roleArn = await executionRoleArn(simAws, {
      roleName: "ObjectReaderRole",
      action: "s3:GetObject",
      resource: `arn:aws:s3:::${bucketName}/*`,
    });
    const zipFile = makeLambdaCodeZip(await bundle(readObjectHandlerSource));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "object-reader",
        Role: roleArn,
        Handler: "index.handler",
        Code: { ZipFile: zipFile },
      }),
    );

    // When the function is invoked.
    const output = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "object-reader",
        Payload: JSON.stringify({ bucket: bucketName, key: objectKey }),
      }),
    );

    // Then the bundled SDK decoded the Object the simulation answered with,
    // bytes and metadata alike.
    assertUndefined(output.FunctionError);
    assertObjectEquals(payloadDocument(output.Payload), {
      body: greeting,
      contentType: "text/plain",
      eTag: upload.ETag,
    });

    await simAws.backgroundTasksComplete();
  });

  it("refuses a bundled S3 read the execution Role is not allowed", async () => {
    // Given a Bucket holding an Object, and a function whose execution Role
    // is allowed everything but reading one.
    const simAws = new SimAws();
    const bucketName = faker.string.alpha({ length: 12, casing: "lower" });
    const objectKey = `${faker.word.noun()}/secret.txt`;
    await simAws
      .s3()
      .createBucket(new CreateBucketCommand({ Bucket: bucketName }));
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: faker.lorem.sentence(),
      }),
    );
    const roleArn = await executionRoleArn(simAws, {
      roleName: "ObjectWriterRole",
      action: "s3:PutObject",
      resource: `arn:aws:s3:::${bucketName}/*`,
    });
    const zipFile = makeLambdaCodeZip(await bundle(readObjectHandlerSource));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "object-reader",
        Role: roleArn,
        Handler: "index.handler",
        Code: { ZipFile: zipFile },
      }),
    );

    // When the function is invoked.
    const output = await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "object-reader",
        Payload: JSON.stringify({ bucket: bucketName, key: objectKey }),
      }),
    );

    // Then the SDK caught the refusal S3 sends a caller without the
    // permission, rather than reading the Object anyway.
    assertUndefined(output.FunctionError);
    assertObjectEquals(payloadDocument(output.Payload), {
      errorName: "AccessDenied",
    });

    await simAws.backgroundTasksComplete();
  });

  it("reports a service whose requests cannot be routed", async () => {
    // Given a function bundling an SDK client for a service that neither uses
    // the AWS JSON protocol nor has an endpoint reading its own.
    const simAws = new SimAws();
    const zipFile = makeLambdaCodeZip(await bundle(sendEmailHandlerSource));
    await simAws.lambda().createFunction(
      new CreateFunctionCommand({
        FunctionName: "notifier",
        Role: "arn:aws:iam::111111111111:role/NotifierRole",
        Handler: "index.handler",
        Code: { ZipFile: zipFile },
      }),
    );

    // When the function is invoked.
    const output = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "notifier" }));

    // Then the failure names the service and what to do about it, rather than
    // reporting missing credentials or hanging on an endpoint.
    assertIdentical(output.FunctionError, "Unhandled");
    const errorMessage = payload(output.Payload);
    assertStringIncludes(errorMessage, "request to ses");
    assertStringIncludes(errorMessage, "AWS JSON protocol");
    assertStringIncludes(errorMessage, "leaving the SDK out");

    await simAws.backgroundTasksComplete();
  });
});

/**
 * What an execution Role is created to be allowed, which is the one thing the
 * test's handler does and nothing else.
 */
interface ExecutionRoleInput {
  readonly roleName: string;
  readonly action: string;
  readonly resource: string;
}

/**
 * Create an execution role allowed one action, so what the handler does is
 * authorized as the role rather than as anything ambient.
 */
async function executionRoleArn(
  simAws: SimAws,
  role: ExecutionRoleInput,
): Promise<string> {
  const creation = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: role.roleName,
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
      RoleName: role.roleName,
      PolicyName: `${role.roleName}Policy`,
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: role.action, Resource: role.resource },
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
 * What a handler returned, read back as the document it answered with.
 */
function payloadDocument(payloadBytes: Uint8Array | undefined): unknown {
  return JSON.parse(payload(payloadBytes)) as unknown;
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

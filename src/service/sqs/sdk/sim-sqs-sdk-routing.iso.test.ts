/* eslint-disable @typescript-eslint/naming-convention -- environment
   variable names are AWS-shaped rather than code identifiers. */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  ChangeMessageVisibilityCommand,
  CreateQueueCommand,
  DeleteMessageBatchCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ListQueuesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageBatchCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  makeSimAwsAccountId,
  type SimAwsAccountId,
} from "../../aws/sim-aws-account.js";
import { makeLambdaCodeZip } from "../../lambda/function/code/make-lambda-code-zip.js";

const emptyBytes = new Uint8Array();

const consumerCode =
  'const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");\n' +
  "exports.handler = async () => {\n" +
  "  const client = new SQSClient({});\n" +
  "  const received = await client.send(new ReceiveMessageCommand({\n" +
  "    QueueUrl: process.env.QUEUE_URL,\n" +
  "  }));\n" +
  "  const message = received.Messages[0];\n" +
  "  await client.send(new DeleteMessageCommand({\n" +
  "    QueueUrl: process.env.QUEUE_URL,\n" +
  "    ReceiptHandle: message.ReceiptHandle,\n" +
  "  }));\n" +
  "  return message.Body;\n" +
  "};\n";

/**
 * A simulated AWS holding a queue with one message on it, and a Lambda function
 * whose code consumes that message as its execution Role.
 */
async function simAwsWithConsumer(
  accountId: SimAwsAccountId,
  policyStatement?: object,
): Promise<{ simAws: SimAws; queueUrl: string }> {
  const simAws = new SimAws({ defaultAccountId: accountId });
  const created = await simAws
    .sqs()
    .createQueue(new CreateQueueCommand({ QueueName: "orders" }));
  const queueUrl = created.QueueUrl ?? "";

  await simAws
    .sqs()
    .sendMessage(
      new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
    );

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "QueueConsumerRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  if (policyStatement !== undefined) {
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "QueueConsumerRole",
        PolicyName: "ConsumeQueue",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: policyStatement,
        }),
      }),
    );
  }

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "order-consumer",
      Role: role.Role.Arn,
      Handler: "index.handler",
      Code: { ZipFile: makeLambdaCodeZip({ "index.js": consumerCode }) },
      Environment: { Variables: { QUEUE_URL: queueUrl } },
    }),
  );

  await simAws.backgroundTasksComplete();

  return { simAws, queueUrl };
}

describe("SQS SDK interception", () => {
  it("routes an intercepted SQSClient to simulated SQS", async () => {
    // Given an intercepted SQS SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(SQSClient);

    const client = new SQSClient({ region: "eu-west-2" });

    // When ordinary SDK code creates a queue, sends a message and reads it back.
    const created = await client.send(
      new CreateQueueCommand({ QueueName: "orders" }),
    );
    await client.send(
      new SendMessageCommand({
        QueueUrl: created.QueueUrl,
        MessageBody: "order-1",
      }),
    );
    const received = await client.send(
      new ReceiveMessageCommand({ QueueUrl: created.QueueUrl }),
    );

    // Then it works with nothing touching the network, and the URL names the
    // Region the client was configured for.
    assertStringIncludes(String(created.QueueUrl), "https://sqs.eu-west-2.");
    assertIdentical(received.Messages?.[0]?.Body, "order-1");
  });

  it("routes every supported Command through the intercepted client", async () => {
    // Given an intercepted SQS SDK client with a queue.
    using simSdk = new SimSdk();
    simSdk.intercept(SQSClient);

    const client = new SQSClient({ region: "eu-west-2" });
    const created = await client.send(
      new CreateQueueCommand({ QueueName: "orders" }),
    );
    const queueUrl = created.QueueUrl;

    // When each of the remaining operations is used.
    const found = await client.send(
      new GetQueueUrlCommand({ QueueName: "orders" }),
    );
    const listed = await client.send(new ListQueuesCommand({}));

    await client.send(
      new SetQueueAttributesCommand({
        QueueUrl: queueUrl,
        Attributes: { VisibilityTimeout: "60" },
      }),
    );

    const attributes = await client.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["VisibilityTimeout"],
      }),
    );

    await client.send(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: [{ Id: "one", MessageBody: "order-1" }],
      }),
    );

    const received = await client.send(
      new ReceiveMessageCommand({ QueueUrl: queueUrl }),
    );
    const receiptHandle = received.Messages?.[0]?.ReceiptHandle;

    await client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: 120,
      }),
    );

    const deleted = await client.send(
      new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: [{ Id: "one", ReceiptHandle: receiptHandle }],
      }),
    );

    await client.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
    await client.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));

    // Then each one reached simulated SQS.
    assertIdentical(found.QueueUrl, queueUrl);
    assertIdentical(listed.QueueUrls?.length, 1);
    assertIdentical(attributes.Attributes?.VisibilityTimeout, "60");
    assertIdentical(deleted.Successful?.[0]?.Id, "one");
  });

  it("consumes a message inside a Lambda handler as the execution Role", async () => {
    // Given a function whose code receives and deletes a message, running as a
    // Role allowed to do both.
    const accountId = makeSimAwsAccountId();
    const { simAws } = await simAwsWithConsumer(accountId, {
      Effect: "Allow",
      Action: ["sqs:ReceiveMessage", "sqs:DeleteMessage"],
      // A queue ARN carries the name with no resource type in front of it.
      Resource: `arn:aws:sqs:us-east-1:${accountId}:orders`,
    });

    // When the function is invoked.
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "order-consumer" }));

    // Then the handler's own SDK calls reached simulated SQS as the execution
    // Role, and that Role's policy allowed them.
    const payload = Buffer.from(invoked.Payload ?? emptyBytes);

    assertStringIncludes(payload.toString("utf8"), "order-1");
  });

  it("denies a Lambda handler whose Role may not read the queue", async () => {
    // Given the same function, running as a Role with no SQS permissions.
    const { simAws } = await simAwsWithConsumer(makeSimAwsAccountId());

    // When the function is invoked.
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "order-consumer" }));

    // Then the handler fails the way it would on real AWS, rather than consuming
    // the message anyway.
    assertIdentical(invoked.FunctionError, "Unhandled");

    const payload = Buffer.from(invoked.Payload ?? emptyBytes);

    assertStringIncludes(payload.toString("utf8"), "not authorized");
  });

  it("leaves a message on the queue when the handler fails", async () => {
    // Given a function whose Role may receive but not delete.
    const accountId = makeSimAwsAccountId();
    const { simAws, queueUrl } = await simAwsWithConsumer(accountId, {
      Effect: "Allow",
      Action: "sqs:ReceiveMessage",
      Resource: `arn:aws:sqs:us-east-1:${accountId}:orders`,
    });

    // When it is invoked and fails part way through.
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "order-consumer" }));

    assertIdentical(invoked.FunctionError, "Unhandled");

    // Then the message comes back once its visibility timeout lapses, as it
    // would on real AWS.
    await simAws.clock().advanceBy({ seconds: 31 });

    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertNonNullable(received.Messages);
    assertIdentical(received.Messages[0]?.Body, "order-1");
  });
});

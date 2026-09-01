/**
 * Asynchronous invocation retries and an OnFailure destination.
 */

import {
  CreateFunctionCommand,
  InvokeCommand,
  PutFunctionEventInvokeConfigCommand,
} from "@aws-sdk/client-lambda";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateQueueCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import {
  makeLambdaZipFileInput,
  type SimLambdaDestinationRecord,
} from "@kensio/yulin/lambda";

const simAws = new SimAws({ defaultAccountId: "111111111111" });
const iam = simAws.iam();
const lambda = simAws.lambda();
const sqs = simAws.sqs();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:order-failures`;

const created = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "order-failures" }),
);

const role = await iam.createRole(
  new CreateRoleCommand({
    RoleName: "OrdersRole",
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
const roleArn = role.Role.Arn;

await iam.putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "OrdersRole",
    PolicyName: "SendFailedOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: {
        Effect: "Allow",
        Action: "sqs:SendMessage",
        Resource: queueArn,
      },
    }),
  }),
);

const attempts: string[] = [];
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: roleArn,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { id: number }) => {
        attempts.push(`tried order ${event.id}`);
        throw new Error("orders handler failed");
      }),
    },
  }),
);

await lambda.putFunctionEventInvokeConfig(
  new PutFunctionEventInvokeConfigCommand({
    FunctionName: "orders",
    MaximumRetryAttempts: 1,
    DestinationConfig: {
      OnFailure: {
        Destination: queueArn,
      },
    },
  }),
);

await lambda.invoke(
  new InvokeCommand({
    FunctionName: "orders",
    InvocationType: "Event",
    Payload: JSON.stringify({ id: 7 }),
  }),
);

// The first attempt runs behind the caller. The retry waits on the clock.
await simAws.backgroundTasksComplete();
console.log(attempts.length);

await simAws.clock().advanceBy({ minutes: 2 });
console.log(attempts.length);

const received = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl: created.QueueUrl }),
);
const record = JSON.parse(
  String(received.Messages?.[0]?.Body),
) as SimLambdaDestinationRecord;
console.log(record.requestContext.condition);
console.log(record.requestContext.approximateInvokeCount);
console.log(record.requestPayload);

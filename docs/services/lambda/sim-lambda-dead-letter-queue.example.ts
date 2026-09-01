/**
 * A simulated Lambda function with a dead-letter queue.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateQueueCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws({ defaultAccountId: "111111111111" });
const iam = simAws.iam();
const lambda = simAws.lambda();
const sqs = simAws.sqs();
const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders-dlq`;

const created = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders-dlq" }),
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

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: roleArn,
    DeadLetterConfig: {
      TargetArn: queueArn,
    },
    Code: {
      ZipFile: makeLambdaZipFileInput(() => {
        throw new Error("orders handler failed");
      }),
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

// Past both retries, so the invocation has been given up on.
await simAws.backgroundTasksComplete();
await simAws.clock().advanceBy({ minutes: 5 });

const received = await sqs.receiveMessage(
  new ReceiveMessageCommand({ QueueUrl: created.QueueUrl }),
);
console.log(received.Messages?.[0]?.Body);

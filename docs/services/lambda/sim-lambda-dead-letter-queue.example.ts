/**
 * A simulated Lambda function with a dead-letter queue.
 */

import { CreateFunctionCommand, InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateQueueCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();
const sqs = simAws.sqs();

const created = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders-dlq" }),
);

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
    DeadLetterConfig: {
      TargetArn: "arn:aws:sqs:us-east-1:888888888888:orders-dlq",
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

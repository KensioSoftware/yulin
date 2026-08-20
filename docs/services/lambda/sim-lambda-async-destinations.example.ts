/**
 * Asynchronous invocation retries and an OnFailure destination.
 */

import {
  CreateFunctionCommand,
  InvokeCommand,
  PutFunctionEventInvokeConfigCommand,
} from "@aws-sdk/client-lambda";
import { CreateQueueCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import {
  makeLambdaZipFileInput,
  type SimLambdaDestinationRecord,
} from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();
const sqs = simAws.sqs();

const created = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "order-failures" }),
);

const attempts: string[] = [];
await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "orders",
    Role: "arn:aws:iam::111111111111:role/OrdersRole",
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
        Destination: "arn:aws:sqs:us-east-1:888888888888:order-failures",
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

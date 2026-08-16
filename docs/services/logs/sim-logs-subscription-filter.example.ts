/**
 * Delivering matched log events to a simulated Lambda function.
 */

import { gunzipSync } from "node:zlib";

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  PutSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/16/[$LATEST]0f7c1a";
const received: string[] = [];

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "error-tracker",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/TrackerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: { awslogs: { data: string } }) => {
          const decoded = JSON.parse(
            gunzipSync(Buffer.from(event.awslogs.data, "base64")).toString(),
          ) as { logEvents: { message: string }[] };

          received.push(...decoded.logEvents.map((line) => line.message));

          return "recorded";
        },
      ),
    },
  }),
);

// CloudWatch Logs invokes as a regional service principal, so this is the
// grant a subscription filter needs on the function's side.
await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "error-tracker",
    StatementId: "logs",
    Action: "lambda:InvokeFunction",
    Principal: `logs.${simAws.defaultRegionName}.amazonaws.com`,
  }),
);
await simAws.backgroundTasksComplete();

await simAws.logs().createLogGroup(new CreateLogGroupCommand({ logGroupName }));
await simAws
  .logs()
  .createLogStream(new CreateLogStreamCommand({ logGroupName, logStreamName }));

await simAws.logs().putSubscriptionFilter(
  new PutSubscriptionFilterCommand({
    logGroupName,
    filterName: "errors-to-tracker",
    filterPattern: "ERROR",
    destinationArn: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:error-tracker`,
  }),
);

await simAws.logs().putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [
      {
        timestamp: Date.parse("2026-08-16T09:00:00Z"),
        message: "INFO starting",
      },
      {
        timestamp: Date.parse("2026-08-16T09:00:01Z"),
        message: "ERROR order has no items",
      },
    ],
  }),
);

// Delivery happens after the write is answered, as it does in an account.
await simAws.backgroundTasksComplete();

console.log(received);

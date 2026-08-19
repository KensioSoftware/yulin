/**
 * Delivering matched log events to a simulated Lambda alias.
 */

import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  PutSubscriptionFilterCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const lambda = simAws.lambda();
const logGroupName = "/aws/lambda/orders";
const logStreamName = "2026/08/19/[$LATEST]0f7c1a";
const trackerArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:error-tracker`;

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "error-tracker",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/TrackerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => {
        console.log(context.functionVersion); // "1", the version behind `live`

        return "recorded";
      }),
    },
  }),
);
await simAws.backgroundTasksComplete();

const published = await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "error-tracker" }),
);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "error-tracker",
    Name: "live",
    FunctionVersion: published.Version,
  }),
);

await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "error-tracker",
    Qualifier: "live",
    StatementId: "logs",
    Action: "lambda:InvokeFunction",
    Principal: `logs.${simAws.defaultRegionName}.amazonaws.com`,
  }),
);

await simAws.logs().createLogGroup(new CreateLogGroupCommand({ logGroupName }));
await simAws
  .logs()
  .createLogStream(new CreateLogStreamCommand({ logGroupName, logStreamName }));

await simAws.logs().putSubscriptionFilter(
  new PutSubscriptionFilterCommand({
    logGroupName,
    filterName: "errors-to-tracker",
    filterPattern: "ERROR",
    destinationArn: `${trackerArn}:live`,
  }),
);

await simAws.logs().putLogEvents(
  new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: [{ timestamp: 1000, message: "ERROR order has no items" }],
  }),
);

await simAws.backgroundTasksComplete();

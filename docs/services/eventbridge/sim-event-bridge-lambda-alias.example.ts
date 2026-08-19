/**
 * A rule sending order events to a Lambda alias, which runs the version it
 * points at.
 */

import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
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
const functionArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:fulfilment`;

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "fulfilment",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/FulfilmentRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => {
        console.log(context.functionVersion); // "1", the version behind `live`

        return "fulfilled";
      }),
    },
  }),
);

const published = await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "fulfilment" }),
);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "fulfilment",
    Name: "live",
    FunctionVersion: published.Version,
  }),
);

// The grant is made on the alias, which is the resource the target names.
await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "fulfilment",
    Qualifier: "live",
    StatementId: "AllowEvents",
    Action: "lambda:InvokeFunction",
    Principal: "events.amazonaws.com",
  }),
);

await simAws.eventBridge().putRule(
  new PutRuleCommand({
    Name: "orders",
    EventPattern: JSON.stringify({ source: ["orders.service"] }),
  }),
);

await simAws.eventBridge().putTargets(
  new PutTargetsCommand({
    Rule: "orders",
    Targets: [{ Id: "fulfilment", Arn: `${functionArn}:live` }],
  }),
);

await simAws.eventBridge().putEvents(
  new PutEventsCommand({
    Entries: [
      { Source: "orders.service", DetailType: "OrderPlaced", Detail: "{}" },
    ],
  }),
);

await simAws.backgroundTasksComplete();

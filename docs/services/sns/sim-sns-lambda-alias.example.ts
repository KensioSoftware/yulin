/**
 * Subscribing a simulated Lambda alias to a topic, so published messages reach
 * the version the alias points at.
 */

import {
  AddPermissionCommand,
  CreateAliasCommand,
  CreateFunctionCommand,
  PublishVersionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateTopicCommand,
  PublishCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();
const sns = simAws.sns();
const lambda = simAws.lambda();
const functionArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:order-consumer`;

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

await lambda.createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-consumer",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrderConsumerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput((_event, context) => {
        console.log(context.functionVersion); // "1", the version behind `live`

        return "handled";
      }),
    },
  }),
);

const published = await lambda.publishVersion(
  new PublishVersionCommand({ FunctionName: "order-consumer" }),
);

await lambda.createAlias(
  new CreateAliasCommand({
    FunctionName: "order-consumer",
    Name: "live",
    FunctionVersion: published.Version,
  }),
);

// The grant is made on the alias, which is the resource the delivery names.
await lambda.addPermission(
  new AddPermissionCommand({
    FunctionName: "order-consumer",
    Qualifier: "live",
    StatementId: "AllowSns",
    Action: "lambda:InvokeFunction",
    Principal: "sns.amazonaws.com",
    SourceArn: TopicArn,
  }),
);

await sns.subscribe(
  new SubscribeCommand({
    TopicArn,
    Protocol: "lambda",
    Endpoint: `${functionArn}:live`,
  }),
);

await sns.publish(new PublishCommand({ TopicArn, Message: "order-1" }));
await simAws.backgroundTasksComplete();

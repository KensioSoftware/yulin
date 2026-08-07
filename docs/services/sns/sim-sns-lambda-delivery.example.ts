/**
 * Invoking a simulated Lambda function from a simulated topic.
 */

import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateTopicCommand,
  PublishCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

interface SnsRecord {
  EventSource: string;
  Sns: { Subject: string | null; Message: string };
}

const simAws = new SimAws();
const sns = simAws.sns();
const consumerArn = `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:order-consumer`;

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "order-consumer",
    Role: `arn:aws:iam::${simAws.defaultAccountId}:role/OrderConsumerRole`,
    Code: {
      ZipFile: makeLambdaZipFileInput((event: { Records: [SnsRecord] }) => {
        const [record] = event.Records;

        console.log(record.EventSource); // "aws:sns"
        console.log(record.Sns.Subject); // "New order"
        console.log(record.Sns.Message); // "order-1"

        return "handled";
      }),
    },
  }),
);

// The function's resource policy is what allows the invocation, and it is
// checked on every message rather than remembered from subscribe time.
await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "order-consumer",
    StatementId: "AllowSns",
    Action: "lambda:InvokeFunction",
    Principal: "sns.amazonaws.com",
    SourceArn: TopicArn,
  }),
);

// A lambda subscription needs no confirmation either, so the ARN comes back at
// once.
await sns.subscribe(
  new SubscribeCommand({ TopicArn, Protocol: "lambda", Endpoint: consumerArn }),
);

await sns.publish(
  new PublishCommand({ TopicArn, Subject: "New order", Message: "order-1" }),
);

// The invocation happens after the publish is answered, as it does on real SNS.
await simAws.backgroundTasksComplete();

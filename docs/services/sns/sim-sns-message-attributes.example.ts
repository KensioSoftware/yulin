/**
 * Message attributes on a published message.
 */

import { CreateTopicCommand, PublishCommand } from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

const published = await sns.publish(
  new PublishCommand({
    TopicArn,
    Message: "order-1",
    MessageAttributes: {
      tenant: { DataType: "String", StringValue: "acme" },
      attempt: { DataType: "Number", StringValue: "1" },
      regions: {
        DataType: "String.Array",
        StringValue: JSON.stringify(["eu-west-2", "us-east-1"]),
      },
    },
  }),
);

console.log(published.MessageId !== undefined); // true

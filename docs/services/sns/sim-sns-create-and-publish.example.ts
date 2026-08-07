/**
 * Creating a simulated topic and publishing a message to it.
 */

import { CreateTopicCommand, PublishCommand } from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

console.log(TopicArn); // "arn:aws:sns:us-east-1:888888888888:orders"

const { MessageId } = await sns.publish(
  new PublishCommand({
    TopicArn,
    Message: "order-1",
    Subject: "New order",
  }),
);

console.log(MessageId !== undefined); // true

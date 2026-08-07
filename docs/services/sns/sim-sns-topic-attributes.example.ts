/**
 * Reading and changing the attributes of a simulated topic.
 */

import {
  CreateTopicCommand,
  GetTopicAttributesCommand,
  SetTopicAttributesCommand,
} from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const sns = simAws.sns();

const { TopicArn } = await sns.createTopic(
  new CreateTopicCommand({ Name: "orders" }),
);

await sns.setTopicAttributes(
  new SetTopicAttributesCommand({
    TopicArn,
    AttributeName: "DisplayName",
    AttributeValue: "Orders",
  }),
);

const read = await sns.getTopicAttributes(
  new GetTopicAttributesCommand({ TopicArn }),
);

console.log(read.Attributes?.["DisplayName"]); // "Orders"
console.log(read.Attributes?.["Owner"]); // "888888888888"
console.log(read.Attributes?.["SubscriptionsConfirmed"]); // "0"

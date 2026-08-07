/**
 * Simulated topics are scoped to an account and region.
 */

import { CreateTopicCommand, PublishCommand } from "@aws-sdk/client-sns";

import { SimAws } from "@kensio/yulin";
import { SimSnsNotFoundException } from "@kensio/yulin/sns";

const simAws = new SimAws();

const { TopicArn } = await simAws
  .account("222222222222")
  .region("eu-west-2")
  .sns()
  .createTopic(new CreateTopicCommand({ Name: "orders" }));

// A topic ARN naming another Region reaches nothing.
try {
  await simAws
    .account("222222222222")
    .region("us-east-1")
    .sns()
    .publish(new PublishCommand({ TopicArn, Message: "order-1" }));
} catch (error) {
  console.log(error instanceof SimSnsNotFoundException); // true
}

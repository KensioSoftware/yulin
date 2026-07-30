/**
 * Simulated queues are scoped to an account and region.
 */

import {
  CreateQueueCommand,
  GetQueueUrlCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import { SimSqsQueueDoesNotExist } from "@kensio/yulin/sqs";

const simAws = new SimAws();

const { QueueUrl } = await simAws
  .account("222222222222")
  .region("eu-west-2")
  .sqs()
  .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

try {
  await simAws
    .account("222222222222")
    .region("us-east-1")
    .sqs()
    .getQueueUrl(new GetQueueUrlCommand({ QueueName: "orders" }));
} catch (error) {
  console.log(error instanceof SimSqsQueueDoesNotExist); // true
}

// A queue URL naming another Region reaches nothing either.
try {
  await simAws
    .account("222222222222")
    .region("us-east-1")
    .sqs()
    .sendMessage(new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }));
} catch (error) {
  console.log(error instanceof SimSqsQueueDoesNotExist); // true
}

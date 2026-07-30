/**
 * A deleted queue holding its name for a minute, as real SQS holds it.
 */

import { CreateQueueCommand, DeleteQueueCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";
import { SimSqsQueueDeletedRecently } from "@kensio/yulin/sqs";

const simAws = new SimAws();
const sqs = simAws.sqs();

const { QueueUrl } = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);

await sqs.deleteQueue(new DeleteQueueCommand({ QueueUrl }));

try {
  await sqs.createQueue(new CreateQueueCommand({ QueueName: "orders" }));
} catch (error) {
  console.log(error instanceof SimSqsQueueDeletedRecently); // true
}

await simAws.clock().advanceBy({ seconds: 61 });

const recreated = await sqs.createQueue(
  new CreateQueueCommand({ QueueName: "orders" }),
);

console.log(recreated.QueueUrl === QueueUrl); // true

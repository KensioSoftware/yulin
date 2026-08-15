/**
 * Driving a simulated ECS container's polling with the simulated clock.
 */

import { SendMessageCommand } from "@aws-sdk/client-sqs";

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const queueUrl: string;
declare const handled: string[];

simAws.clock().freeze();

await simAws.sqs().sendMessage(
  new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: "order-1",
    DelaySeconds: 60,
  }),
);
await simAws.backgroundTasksComplete();

console.log(handled.length); // 0, the message is not receivable yet

await simAws.clock().advanceBy({ seconds: 60 });

console.log(handled.length); // 1, the clock got there and the poll happened

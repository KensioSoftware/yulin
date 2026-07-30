/**
 * A simulated AWS with one queue on it, which nearly every SQS test needs
 * before it can say anything about messages.
 *
 * This lives under `test/` for the same reasons as `test/kms/`: eslint rejects a
 * test file that exports helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else, excluded from the published
 * build, not collected as a suite, and not counted in coverage.
 */

import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";

/**
 * One simulated AWS and the URL of the one queue on it.
 */
export interface SimSqsQueueFixture {
  readonly simAws: SimAws;
  readonly queueUrl: string;
}

/**
 * One simulated AWS holding a message that has been received once, and the
 * receipt handle that receive was answered with.
 */
export interface SimSqsReceivedMessageFixture extends SimSqsQueueFixture {
  readonly receiptHandle: string;
}

/**
 * Make a simulated AWS holding one queue named `orders`.
 */
export async function simAwsWithQueue(
  attributes?: Record<string, string>,
  existing?: SimAws,
): Promise<SimSqsQueueFixture> {
  const simAws = existing ?? new SimAws();
  const created = await simAws.sqs().createQueue(
    new CreateQueueCommand({
      QueueName: "orders",
      ...(attributes !== undefined && { Attributes: attributes }),
    }),
  );

  assertNonNullable(created.QueueUrl, "CreateQueue answered with a queue URL");

  return { simAws, queueUrl: created.QueueUrl };
}

/**
 * One simulated AWS holding a queue that redrives to a dead-letter queue.
 */
export interface SimSqsDeadLetterQueueFixture extends SimSqsQueueFixture {
  readonly deadLetterQueueUrl: string;
  readonly deadLetterQueueArn: string;
}

/**
 * Make a simulated AWS holding a queue named `orders` that gives up on a message
 * after `maxReceiveCount` receives and moves it to a queue named `orders-dlq`.
 */
export async function simAwsWithDeadLetterQueue(
  maxReceiveCount: number,
): Promise<SimSqsDeadLetterQueueFixture> {
  const simAws = new SimAws();
  const created = await simAws
    .sqs()
    .createQueue(new CreateQueueCommand({ QueueName: "orders-dlq" }));

  assertNonNullable(created.QueueUrl, "CreateQueue answered with a queue URL");

  const deadLetterQueueArn = simAws.sqs().findQueue("orders-dlq")?.arn.value;

  assertNonNullable(deadLetterQueueArn, "The dead-letter queue has an ARN");

  const { queueUrl } = await simAwsWithQueue(
    {
      VisibilityTimeout: "30",
      RedrivePolicy: JSON.stringify({
        deadLetterTargetArn: deadLetterQueueArn,
        maxReceiveCount,
      }),
    },
    simAws,
  );

  return {
    simAws,
    queueUrl,
    deadLetterQueueUrl: created.QueueUrl,
    deadLetterQueueArn,
  };
}

/**
 * Receive a message and leave it undeleted until its visibility timeout lapses,
 * which is how a consumer that cannot handle a message fails to handle it.
 */
export async function failToHandleMessage(
  simAws: SimAws,
  queueUrl: string,
): Promise<void> {
  await simAws
    .sqs()
    .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
  await simAws.clock().advanceBy({ seconds: 31 });
}

/**
 * Make a simulated AWS holding one queue with one already received message on it.
 */
export async function simAwsWithReceivedMessage(
  attributes?: Record<string, string>,
): Promise<SimSqsReceivedMessageFixture> {
  const { simAws, queueUrl } = await simAwsWithQueue(attributes);

  await simAws
    .sqs()
    .sendMessage(
      new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
    );

  const received = await simAws
    .sqs()
    .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

  const receiptHandle = received.Messages?.[0]?.ReceiptHandle;

  assertNonNullable(
    receiptHandle,
    "ReceiveMessage answered with a receipt handle",
  );

  return { simAws, queueUrl, receiptHandle };
}

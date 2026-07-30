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
): Promise<SimSqsQueueFixture> {
  const simAws = new SimAws();
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

/**
 * A simulated AWS with a subscribed queue on it, which every SNS subscription
 * test needs before it can say anything about a subscription.
 *
 * This lives under `test/` for the same reasons as `test/sns/topic-fixture.ts`:
 * eslint rejects a test file that exports helpers alongside its own `describe`
 * calls, and `test/**` is type-checked with everything else, excluded from the
 * published build, not collected as a suite, and not counted in coverage.
 */

import { SubscribeCommand } from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { assertNonNullable, assertThrowsErrorAsync } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { AwsRegionName } from "../../src/service/aws/sim-aws-region.js";
import type { SimSnsSentSmsMessage } from "../../src/service/sns/sms/sim-sns-sent-sms-message.js";
import { simAwsWithTopic } from "./topic-fixture.js";

/**
 * The ARN of a queue named `orders-queue` in the default Account and Region.
 */
export const simSnsOrdersQueueArn =
  "arn:aws:sqs:us-east-1:888888888888:orders-queue";

/**
 * One simulated AWS, its `orders` topic and one subscription to it.
 */
export interface SimSnsSubscriptionFixture {
  readonly simAws: SimAws;
  readonly topicArn: string;
  readonly subscriptionArn: string;
}

/**
 * Subscribe a queue of a name to a topic.
 */
export async function subscribeQueue(
  simAws: SimAws,
  topicArn: string | undefined,
  queueName: string,
): Promise<string> {
  const subscribed = await simAws.sns().subscribe(
    new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: "sqs",
      Endpoint: `arn:aws:sqs:us-east-1:888888888888:${queueName}`,
    }),
  );

  assertNonNullable(
    subscribed.SubscriptionArn,
    "Subscribe answered with an ARN",
  );

  return subscribed.SubscriptionArn;
}

/**
 * Make a simulated AWS holding one topic with `orders-queue` subscribed to it.
 */
export async function simAwsWithSubscription(): Promise<SimSnsSubscriptionFixture> {
  const { simAws, topicArn } = await simAwsWithTopic();

  return {
    simAws,
    topicArn,
    subscriptionArn: await subscribeQueue(simAws, topicArn, "orders-queue"),
  };
}

/**
 * Subscribe to a fresh `orders` topic, answering with whatever it threw.
 *
 * Every field is optional here and defaulted to nothing, so a test can leave
 * out the one it is about. The SDK's own input type requires both the protocol
 * and the endpoint.
 */
export async function subscribeRefusal(
  input: Partial<SubscribeCommand["input"]>,
): Promise<Error> {
  const { simAws, topicArn } = await simAwsWithTopic();

  return assertThrowsErrorAsync(async () => {
    await simAws.sns().subscribe(
      new SubscribeCommand({
        Protocol: undefined,
        Endpoint: undefined,
        ...input,
        TopicArn: topicArn,
      }),
    );
  });
}

/**
 * The protocols real SNS has that nothing in the simulation delivers over.
 */
export const simSnsUnsimulatedProtocols = [
  "http",
  "https",
  "email",
  "email-json",
  "application",
  "firehose",
];

/**
 * Endpoints that are not an E.164 phone number, one of each way to not be one.
 */
export const simSnsEndpointsThatAreNotPhoneNumbers = [
  "5550100",
  "+0155501000",
  "+1 555 0100",
  "+1555010012345678",
  "",
];

/**
 * Subscribe a phone number to a topic, answering with the subscription ARN.
 */
export async function subscribePhoneNumber(
  simAws: SimAws,
  topicArn: string,
  phoneNumber: string,
  attributes?: Record<string, string>,
): Promise<string> {
  const subscribed = await simAws.sns().subscribe(
    new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: "sms",
      Endpoint: phoneNumber,
      ...(attributes !== undefined && { Attributes: attributes }),
    }),
  );

  assertNonNullable(
    subscribed.SubscriptionArn,
    "Subscribe answered with an ARN",
  );

  return subscribed.SubscriptionArn;
}

/**
 * Wait for delivery, then take the SMS messages one simulated SNS recorded.
 *
 * Delivery happens on the background scheduler, as it does on real SNS after
 * the publish has been answered, so nothing has been texted until that work is
 * done.
 */
export async function simSnsTextedMessages(
  simAws: SimAws,
): Promise<readonly SimSnsSentSmsMessage[]> {
  await simAws.backgroundTasksComplete();

  return simAws.sns().sentSmsMessages();
}

/**
 * Endpoints that are not an SQS queue ARN, one of each way to not be one.
 */
export const simSnsEndpointsThatAreNotQueues = [
  "https://example.com/orders",
  "arn:aws:sqs:us-east-1:888888888888",
  "arn:aws:sns:us-east-1:888888888888:orders",
  "",
];

/**
 * An Account and Region a queue lives in, when it is not the default one.
 */
export interface SimSnsScope {
  readonly accountId?: string;
  readonly regionName?: AwsRegionName;
}

/**
 * A queue policy admitting SNS to send to a queue for one topic.
 *
 * This is the grant real SNS needs on the queue's side, and it is the one AWS
 * documents: the service principal, the send action, and the topic it is
 * sending for as `aws:SourceArn`.
 */
export function simSnsQueuePolicy(queueArn: string, topicArn: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "sns.amazonaws.com" },
        Action: "sqs:SendMessage",
        Resource: queueArn,
        Condition: { ArnLike: { "aws:SourceArn": topicArn } },
      },
    ],
  });
}

/**
 * Create a queue in a scope, with a policy admitting SNS for a topic.
 *
 * The queue ARN is built rather than read back, because a queue's ARN is the
 * one thing CreateQueue does not answer with.
 */
export async function simSnsSubscribedQueue(
  simAws: SimAws,
  queueName: string,
  topicArn: string,
  scope: SimSnsScope = {},
): Promise<{ queueUrl: string; queueArn: string }> {
  const accountId = scope.accountId ?? simAws.defaultAccountId;
  const regionName = scope.regionName ?? simAws.defaultRegionName;
  const sqs = simAws.account(accountId).region(regionName).sqs();
  const created = await sqs.createQueue(
    new CreateQueueCommand({ QueueName: queueName }),
  );

  assertNonNullable(created.QueueUrl, "CreateQueue answered with a queue URL");

  const queueArn = `arn:aws:sqs:${regionName}:${accountId}:${queueName}`;

  await sqs.setQueueAttributes(
    new SetQueueAttributesCommand({
      QueueUrl: created.QueueUrl,
      Attributes: { Policy: simSnsQueuePolicy(queueArn, topicArn) },
    }),
  );

  await simAws.sns().subscribe(
    new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: "sqs",
      Endpoint: queueArn,
    }),
  );

  return { queueUrl: created.QueueUrl, queueArn };
}

/**
 * Wait for delivery, then take the one message a queue received.
 *
 * Delivery happens on the background scheduler, as it does on real SNS after
 * the publish has been answered, so nothing has arrived until that work is
 * done.
 */
export async function simSnsDeliveredMessage(
  simAws: SimAws,
  queueUrl: string,
  scope: SimSnsScope = {},
): Promise<string | undefined> {
  await simAws.backgroundTasksComplete();

  const received = await simAws
    .account(scope.accountId ?? simAws.defaultAccountId)
    .region(scope.regionName ?? simAws.defaultRegionName)
    .sqs()
    .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

  return received.Messages?.[0]?.Body;
}

/**
 * Subscribe a queue over a protocol, answering with whatever it threw.
 */
export async function protocolRefusal(
  protocol: string | undefined,
): Promise<Error> {
  return subscribeRefusal({
    Protocol: protocol,
    Endpoint: simSnsOrdersQueueArn,
  });
}

/**
 * Subscribe an endpoint over the sqs protocol, answering with what it threw.
 */
export async function endpointRefusal(
  endpoint: string | undefined,
): Promise<Error> {
  return subscribeRefusal({ Protocol: "sqs", Endpoint: endpoint });
}

/**
 * Subscribe an endpoint over the sms protocol, answering with what it threw.
 */
export async function phoneNumberRefusal(
  endpoint: string | undefined,
): Promise<Error> {
  return subscribeRefusal({ Protocol: "sms", Endpoint: endpoint });
}

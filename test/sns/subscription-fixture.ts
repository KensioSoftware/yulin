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
import { assertNonNullable, assertThrowsErrorAsync } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
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
  "lambda",
  "http",
  "https",
  "email",
  "email-json",
  "sms",
  "application",
  "firehose",
];

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

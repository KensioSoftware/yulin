import {
  CreateTopicCommand,
  GetSubscriptionAttributesCommand,
  ListSubscriptionsByTopicCommand,
  ListSubscriptionsCommand,
  SetSubscriptionAttributesCommand,
  SNSClient,
  SubscribeCommand,
  UnsubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertNonNullable,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

describe("SNS SDK subscription interception", () => {
  it("routes every subscription Command through the intercepted client", async () => {
    // Given an intercepted SNS SDK client with a topic.
    using simSdk = new SimSdk();
    simSdk.intercept(SNSClient);

    const client = new SNSClient({ region: "us-east-1" });
    const created = await client.send(
      new CreateTopicCommand({ Name: "orders" }),
    );
    const topicArn = created.TopicArn;

    // When each subscription operation is used.
    const subscribed = await client.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: "arn:aws:sqs:us-east-1:888888888888:orders-queue",
      }),
    );
    const subscriptionArn = subscribed.SubscriptionArn;

    await client.send(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
        AttributeName: "RawMessageDelivery",
        AttributeValue: "true",
      }),
    );

    const read = await client.send(
      new GetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
      }),
    );
    const listed = await client.send(new ListSubscriptionsCommand({}));
    const byTopic = await client.send(
      new ListSubscriptionsByTopicCommand({ TopicArn: topicArn }),
    );

    await client.send(
      new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }),
    );

    // Then each reached the simulated SNS this SimSdk owns.
    assertNonNullable(read.Attributes);
    assertObjectMatches(read.Attributes, { RawMessageDelivery: "true" });
    assertArrayLength(listed.Subscriptions, 1);
    assertArrayLength(byTopic.Subscriptions, 1);
    assertArrayEmpty(simSdk.simAws.sns().topicSubscriptions("orders"));
  });
});

import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CheckIfPhoneNumberIsOptedOutCommand,
  CreateTopicCommand,
  DeleteTopicCommand,
  GetSubscriptionAttributesCommand,
  GetTopicAttributesCommand,
  ListPhoneNumbersOptedOutCommand,
  ListSubscriptionsByTopicCommand,
  ListSubscriptionsCommand,
  ListTagsForResourceCommand,
  ListTopicsCommand,
  OptInPhoneNumberCommand,
  PublishBatchCommand,
  PublishCommand,
  SetSubscriptionAttributesCommand,
  SetTopicAttributesCommand,
  SNSClient,
  SubscribeCommand,
  UnsubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  ReceiveMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertArrayIncludes,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simSnsQueuePolicy } from "../../../../test/sns/subscription-fixture.js";

/**
 * Simulated SNS reached over a port by a real client, which is the shape a
 * container or a non-Node application publishing to a topic has.
 *
 * SNS speaks the Query protocol, so what these cover is whether an operation
 * survives a form-encoded request and an XML envelope on the way back.
 */
describe("Serving simulated SNS on an endpoint URL", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let endpoint: string;
  let client: SNSClient;
  let accountId: string;

  beforeAll(async () => {
    await srv.listen();
    endpoint = `http://localhost:${srv.port}`;
    accountId = simAws.defaultAccountId;

    const simIam = simAws.iam();
    await simIam.createUser(new CreateUserCommand({ UserName: "Publisher" }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Publisher",
        PolicyName: "Everything",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "*", Resource: "*" },
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Publisher" }),
    );

    client = new SNSClient({
      region: simAws.defaultRegionName,
      endpoint,
      credentials: {
        accessKeyId: created.AccessKey.AccessKeyId,
        secretAccessKey: created.AccessKey.SecretAccessKey,
      },
    });
  });

  afterAll(async () => {
    await srv.close();
  });

  /**
   * Make a topic over the endpoint, answering with its ARN.
   */
  async function createTopic(name: string): Promise<string> {
    const topic = await client.send(
      new CreateTopicCommand({
        Name: name,
        Attributes: { DisplayName: "Orders" },
      }),
    );

    assertNonNullable(topic.TopicArn, "CreateTopic answered with an ARN");

    return topic.TopicArn;
  }

  /**
   * Make a queue SNS is admitted to send to, answering with its URL and ARN.
   */
  async function createSubscribedQueue(
    queueName: string,
    topicArn: string,
  ): Promise<{ queueUrl: string; queueArn: string }> {
    const simSqs = simAws.sqs();
    const queue = await simSqs.createQueue(
      new CreateQueueCommand({ QueueName: queueName }),
    );
    const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${accountId}:${queueName}`;

    await simSqs.setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: queue.QueueUrl,
        Attributes: { Policy: simSnsQueuePolicy(queueArn, topicArn) },
      }),
    );

    assertNonNullable(queue.QueueUrl, "CreateQueue answered with a URL");

    return { queueUrl: queue.QueueUrl, queueArn };
  }

  it("makes a topic, reads its attributes back and lists it", async () => {
    // Given a topic created over the endpoint with attributes and tags
    const topicArn = await createTopic("orders");

    // When its attributes are read back and one of them is changed
    const attributes = await client.send(
      new GetTopicAttributesCommand({ TopicArn: topicArn }),
    );
    await client.send(
      new SetTopicAttributesCommand({
        TopicArn: topicArn,
        AttributeName: "DisplayName",
        AttributeValue: "Order events",
      }),
    );
    const changed = await client.send(
      new GetTopicAttributesCommand({ TopicArn: topicArn }),
    );

    // Then the map survived the envelope in both directions, and the topic is
    // in the listing
    const before = attributes.Attributes ?? {};
    const after = changed.Attributes ?? {};
    assertIdentical(before["DisplayName"], "Orders");
    assertIdentical(before["TopicArn"], topicArn);
    assertIdentical(after["DisplayName"], "Order events");

    const listed = await client.send(new ListTopicsCommand({}));
    assertArrayIncludes(
      (listed.Topics ?? []).map((topic) => topic.TopicArn),
      topicArn,
    );
  });

  it("publishes to a queue subscribed over the endpoint", async () => {
    // Given a queue subscribed to a topic, both over the endpoint
    const topicArn = await createTopic("deliveries");
    const { queueUrl, queueArn } = await createSubscribedQueue(
      "deliveries-queue",
      topicArn,
    );

    const subscribed = await client.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueArn,
        ReturnSubscriptionArn: true,
      }),
    );
    const subscriptionArn = subscribed.SubscriptionArn;
    assertNonNullable(subscriptionArn, "Subscribe answered with an ARN");

    // When a message with attributes of both kinds is published
    await client.send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: "One delivery",
        Message: "delivery-1",
        MessageAttributes: {
          city: { DataType: "String", StringValue: "Leeds" },
          label: {
            DataType: "Binary",
            BinaryValue: Buffer.from("printed"),
          },
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the envelope arrived on the queue with both attributes intact
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));
    assertArrayLength(received.Messages ?? [], 1);

    const envelope = JSON.parse(received.Messages?.[0]?.Body ?? "{}") as Record<
      string,
      Record<string, Record<string, string>>
    >;
    const published = envelope["MessageAttributes"] ?? {};
    assertIdentical(envelope["Message"] as unknown, "delivery-1");
    assertIdentical(published["city"]?.["Value"], "Leeds");
    assertIdentical(
      published["label"]?.["Value"],
      Buffer.from("printed").toString("base64"),
    );

    // And the subscription is described and changed over the same endpoint
    const listed = await client.send(
      new ListSubscriptionsByTopicCommand({ TopicArn: topicArn }),
    );
    const [subscription] = listed.Subscriptions ?? [];
    assertNonNullable(subscription, "the topic's one subscription");
    assertIdentical(subscription.Endpoint, queueArn);
    assertIdentical(subscription.Protocol, "sqs");
    assertIdentical(subscription.Owner, accountId);

    const all = await client.send(new ListSubscriptionsCommand({}));
    assertArrayIncludes(
      (all.Subscriptions ?? []).map((subscription) => subscription.TopicArn),
      topicArn,
    );

    await client.send(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
        AttributeName: "RawMessageDelivery",
        AttributeValue: "true",
      }),
    );
    const subscriptionAttributes = await client.send(
      new GetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
      }),
    );
    const rawDelivery =
      subscriptionAttributes.Attributes?.["RawMessageDelivery"];
    assertIdentical(rawDelivery, "true");

    // And unsubscribing over the endpoint leaves the topic with none
    await client.send(
      new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }),
    );
    const remaining = await client.send(
      new ListSubscriptionsByTopicCommand({ TopicArn: topicArn }),
    );
    assertArrayLength(remaining.Subscriptions ?? [], 0);
  });

  it("publishes a batch and reports each entry by its id", async () => {
    // Given a topic
    const topicArn = await createTopic("batched");

    // When two messages are published in one request
    const published = await client.send(
      new PublishBatchCommand({
        TopicArn: topicArn,
        PublishBatchRequestEntries: [
          { Id: "one", Message: "first" },
          { Id: "two", Message: "second" },
        ],
      }),
    );

    // Then both come back in the list the envelope carries them in
    const successful = published.Successful ?? [];
    assertArrayLength(successful, 2);

    const [first, second] = successful;
    assertNonNullable(first, "the first batch entry");
    assertNonNullable(second, "the second batch entry");
    assertIdentical(first.Id, "one");
    assertIdentical(second.Id, "two");
    assertNonNullable(first.MessageId, "the first entry's message id");
  });

  it("reports and reverses a phone number's opt-out", async () => {
    // Given a number whose recipient replied STOP
    const phoneNumber = "+15550100";
    simAws.sns().optOutPhoneNumber(phoneNumber);

    // When the opt-out list is read over the endpoint
    const optedOut = await client.send(
      new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber }),
    );
    const listed = await client.send(new ListPhoneNumbersOptedOutCommand({}));

    // Then the number is on it, and opting it back in takes it off
    assertTrue(optedOut.isOptedOut ?? false);
    assertArrayIncludes(listed.phoneNumbers ?? [], phoneNumber);

    await client.send(new OptInPhoneNumberCommand({ phoneNumber }));
    const optedIn = await client.send(
      new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber }),
    );
    assertFalse(optedIn.isOptedOut ?? true);
  });

  it("texts a phone number published to directly", async () => {
    // When a message is published to a number rather than to a topic
    await client.send(
      new PublishCommand({
        PhoneNumber: "+15550111",
        Message: "your delivery is out",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then simulated SNS recorded the SMS it would have sent
    const texted = simAws.sns().sentSmsMessages();
    assertIdentical(texted.at(-1)?.phoneNumber, "+15550111");
  });

  it("removes a topic, which is then gone for the next request", async () => {
    // Given a topic that is deleted over the endpoint
    const topicArn = await createTopic("retired");
    await client.send(new DeleteTopicCommand({ TopicArn: topicArn }));

    // When it is asked about again
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new GetTopicAttributesCommand({ TopicArn: topicArn }),
        ),
    );

    // Then the refusal arrives under the name simulated SNS threw it as
    assertIdentical(error.name, "NotFoundException");
  });

  it("refuses an SNS operation it does not serve", async () => {
    // When an operation simulated SNS has no answer for is asked for
    const error = await assertThrowsErrorAsync(
      async () =>
        await client.send(
          new ListTagsForResourceCommand({
            ResourceArn: `arn:aws:sns:${simAws.defaultRegionName}:${accountId}:orders`,
          }),
        ),
    );

    // Then it is refused by name, in the shape the Query protocol states an
    // error, so the SDK raises it rather than failing to parse the response
    assertIdentical(error.name, "NotImplemented");
    assertStringIncludes(error.message, "ListTagsForResource");
  });
});

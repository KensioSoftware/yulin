import { PublishCommand, UnsubscribeCommand } from "@aws-sdk/client-sns";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simSnsDeliveredMessage,
  simSnsSubscribedQueue,
  simSnsTextedMessages,
  subscribePhoneNumber,
} from "../../../../../test/sns/subscription-fixture.js";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";

/** The numbers the topic texts here. */
const onCall = "+15550100";

const escalation = "+15550111";

describe("SNS fan-out to a phone number", () => {
  it("records what a published message would have texted", async () => {
    // Given a topic with a phone number subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const subscriptionArn = await subscribePhoneNumber(
      simAws,
      topicArn,
      onCall,
    );

    // When a message is published to the topic.
    const published = await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: "Disk usage",
        Message: "Disk full",
      }),
    );

    // Then the SMS is on the record, naming the topic and the subscription
    // that produced it. The body is the message as it was published: a handset
    // receives the text on its own, so the envelope a queue receives and the
    // subject an email carries are both left off.
    const [sms] = await simSnsTextedMessages(simAws);

    assertNonNullable(sms);
    assertIdentical(sms.phoneNumber, onCall);
    assertIdentical(sms.message, "Disk full");
    assertIdentical(sms.topicArn, topicArn);
    assertIdentical(sms.subscriptionArn, subscriptionArn);
    assertIdentical(sms.messageId, published.MessageId);
    assertFalse(sms.suppressed);
  });

  it("texts every number subscribed to the topic", async () => {
    // Given a topic with two phone numbers subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();

    await subscribePhoneNumber(simAws, topicArn, onCall);
    await subscribePhoneNumber(simAws, topicArn, escalation);

    // When one message is published.
    await simAws
      .sns()
      .publish(
        new PublishCommand({ TopicArn: topicArn, Message: "Disk full" }),
      );

    // Then both numbers were texted, which is what a topic is for.
    const texted = await simSnsTextedMessages(simAws);

    assertArrayLength(texted, 2);
    assertIdentical(texted[0].phoneNumber, onCall);
    assertIdentical(texted[1].phoneNumber, escalation);
  });

  it("texts a number alongside a queue taking the same message", async () => {
    // Given a topic notifying both a queue and a phone number, which is the
    // shape an alerting path has.
    const { simAws, topicArn } = await simAwsWithTopic();
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "alerts",
      topicArn,
    );

    await subscribePhoneNumber(simAws, topicArn, onCall);

    // When one message is published.
    await simAws
      .sns()
      .publish(
        new PublishCommand({ TopicArn: topicArn, Message: "Disk full" }),
      );

    // Then the queue received the envelope and the number was texted the
    // message on its own.
    const body = await simSnsDeliveredMessage(simAws, queueUrl);

    assertNonNullable(body);
    assertIdentical(
      (JSON.parse(body) as Record<string, unknown>)["Message"],
      "Disk full",
    );

    const [sms] = await simSnsTextedMessages(simAws);

    assertIdentical(sms?.message, "Disk full");
  });

  it("leaves out a number whose filter policy does not want the message", async () => {
    // Given a topic with one number taking every alert and one taking only the
    // high severity ones.
    const { simAws, topicArn } = await simAwsWithTopic();

    await subscribePhoneNumber(simAws, topicArn, onCall);
    await subscribePhoneNumber(simAws, topicArn, escalation, {
      FilterPolicy: JSON.stringify({ severity: ["high"] }),
    });

    // When a message the second one's policy excludes is published.
    await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Message: "Disk filling up",
        MessageAttributes: {
          severity: { DataType: "String", StringValue: "low" },
        },
      }),
    );

    // Then only the number that wanted it was texted, and the other
    // subscription's policy had nothing to do with that.
    const texted = await simSnsTextedMessages(simAws);

    assertArrayLength(texted, 1);
    assertIdentical(texted[0].phoneNumber, onCall);
  });

  it("suppresses the SMS to an opted-out number and texts the others", async () => {
    // Given a topic with two numbers subscribed, one of which has replied
    // STOP.
    const { simAws, topicArn } = await simAwsWithTopic();

    await subscribePhoneNumber(simAws, topicArn, onCall);
    await subscribePhoneNumber(simAws, topicArn, escalation);
    simAws.sns().optOutPhoneNumber(escalation);

    // When a message is published.
    const published = await simAws
      .sns()
      .publish(
        new PublishCommand({ TopicArn: topicArn, Message: "Disk full" }),
      );

    // Then the publish succeeded, as it does on real SNS, the opted-out number
    // has a record saying nothing arrived, and the other number was texted.
    assertNonNullable(published.MessageId);

    const [first, second] = await simSnsTextedMessages(simAws);

    assertFalse(first?.suppressed);
    assertIdentical(second?.phoneNumber, escalation);
    assertTrue(second.suppressed);
  });

  it("stops texting once the subscription is gone", async () => {
    // Given a topic with a subscribed number that is then unsubscribed.
    const { simAws, topicArn } = await simAwsWithTopic();
    const subscriptionArn = await subscribePhoneNumber(
      simAws,
      topicArn,
      onCall,
    );

    await simAws
      .sns()
      .unsubscribe(
        new UnsubscribeCommand({ SubscriptionArn: subscriptionArn }),
      );

    // When a message is published.
    await simAws
      .sns()
      .publish(
        new PublishCommand({ TopicArn: topicArn, Message: "Disk full" }),
      );

    // Then nothing was texted.
    assertArrayLength(await simSnsTextedMessages(simAws), 0);
  });
});

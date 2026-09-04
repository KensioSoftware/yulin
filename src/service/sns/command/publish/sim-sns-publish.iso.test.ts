import { PublishCommand } from "@aws-sdk/client-sns";
import {
  assertInstanceOf,
  assertNonNullable,
  assertNotEqual,
  assertStringLength,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";
import { SimSnsNotFoundException } from "../../error/sim-sns.error.js";

describe("SNS publish", () => {
  it("takes a publish to a topic nothing subscribes to", async () => {
    // Given a topic with no subscriptions.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When a message is published to it.
    const published = await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Message: "order-1",
        Subject: "New order",
      }),
    );

    // Then it is accepted and answered with a message id, as real SNS answers
    // a publish that reached nobody.
    assertNonNullable(published.MessageId);
    assertStringLength(published.MessageId, 36);
  });

  it("gives every message its own id", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When the same message is published twice.
    const first = await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));
    const second = await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

    // Then the two publishes are told apart by their ids.
    assertNotEqual(first.MessageId, second.MessageId);
  });

  it("takes a subject that is UTF-8 rather than ASCII", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When a subject with characters outside ASCII is published, and one of
    // the ninety-nine characters real SNS allows.
    const accented = await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Message: "order-1",
        Subject: "Nouvelle commande \u{1F4E6}",
      }),
    );
    const longest = await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Message: "order-1",
        Subject: "x".repeat(99),
      }),
    );

    // Then both go through, since a subject is UTF-8 text of fewer than a
    // hundred characters rather than ASCII text.
    assertNonNullable(accented.MessageId);
    assertNonNullable(longest.MessageId);
  });

  it("takes the message attributes real SNS takes", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When a message is published with each kind of attribute.
    const published = await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Message: "order-1",
        MessageAttributes: {
          tenant: { DataType: "String", StringValue: "acme" },
          attempt: { DataType: "Number", StringValue: "1" },
          regions: {
            DataType: "String.Array",
            StringValue: JSON.stringify(["eu-west-2"]),
          },
          payload: {
            DataType: "Binary",
            BinaryValue: new Uint8Array([1, 2, 3]),
          },
        },
      }),
    );

    // Then it is accepted.
    assertNonNullable(published.MessageId);
  });

  it("refuses a publish to a topic that does not exist", async () => {
    // Given a simulated AWS whose only topic is named something else.
    const { simAws } = await simAwsWithTopic();

    // When a message is published to a topic that is not there.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().publish(
        new PublishCommand({
          TopicArn: "arn:aws:sns:us-east-1:888888888888:invoices",
          Message: "order-1",
        }),
      );
    });

    // Then it is refused rather than accepted and dropped.
    assertInstanceOf(error, SimSnsNotFoundException);
  });
});

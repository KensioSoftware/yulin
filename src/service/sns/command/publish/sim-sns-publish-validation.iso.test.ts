import { PublishCommand } from "@aws-sdk/client-sns";
import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";
import {
  SimSnsInvalidParameterException,
  SimSnsInvalidParameterValueException,
} from "../../error/sim-sns.error.js";

describe("SNS publish validation", () => {
  it("refuses an empty message", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When a publish carries no message.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().publish({ input: { TopicArn: topicArn } });
    });

    // Then it is refused, as real SNS refuses an empty message.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });

  it("refuses a subject real SNS would refuse", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When a subject with a line break, one with a control character, and one
    // of exactly a hundred characters are used.
    const refusals = await Promise.all(
      ["New\norder", "New\u{7}order", "x".repeat(100)].map(async (subject) =>
        assertThrowsErrorAsync(async () => {
          await simAws.sns().publish(
            new PublishCommand({
              TopicArn: topicArn,
              Message: "order-1",
              Subject: subject,
            }),
          );
        }),
      ),
    );

    // Then each is refused. Real SNS states the limit as fewer than a hundred
    // characters, so a hundred is already too long.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsInvalidParameterException);
    }
  });

  it("refuses a message attribute real SNS would refuse", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When attributes with a reserved name, an unknown type and a value that
    // does not match its type are published.
    const refusals = await Promise.all(
      [
        { "AWS.reserved": { DataType: "String", StringValue: "no" } },
        { tenant: { DataType: "Map", StringValue: "acme" } },
        { tenant: { DataType: "String", BinaryValue: new Uint8Array([1]) } },
        { tenant: { DataType: "Binary", StringValue: "acme" } },
      ].map(async (attributes) =>
        assertThrowsErrorAsync(async () => {
          await simAws.sns().publish(
            new PublishCommand({
              TopicArn: topicArn,
              Message: "order-1",
              MessageAttributes: attributes,
            }),
          );
        }),
      ),
    );

    // Then each is refused here rather than on AWS.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsInvalidParameterValueException);
    }
  });
});

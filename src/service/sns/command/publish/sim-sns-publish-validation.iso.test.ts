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

    // When a subject with a line break, and one beginning with a space, are
    // used.
    const refusals = await Promise.all(
      ["New\norder", " New order"].map(async (subject) =>
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

    // Then both are refused.
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

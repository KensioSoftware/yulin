import { PublishCommand } from "@aws-sdk/client-sns";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";
import { SimSnsInvalidParameterException } from "../../error/sim-sns.error.js";
import { simSnsMaximumPublishBytes } from "../../message/sim-sns-published-message.js";

describe("SNS publish size limit", () => {
  it("refuses a message over the publish size limit", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When a message larger than 256 KB is published.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().publish(
        new PublishCommand({
          TopicArn: topicArn,
          Message: "x".repeat(simSnsMaximumPublishBytes + 1),
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSnsInvalidParameterException);
    assertStringIncludes(error.message, "too long");
  });

  it("counts the message attributes against the size limit", async () => {
    // Given a topic and a message just inside the limit on its own.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When it is published with an attribute that tips it over.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().publish(
        new PublishCommand({
          TopicArn: topicArn,
          Message: "x".repeat(simSnsMaximumPublishBytes - 10),
          MessageAttributes: {
            tenant: { DataType: "String", StringValue: "acme" },
          },
        }),
      );
    });

    // Then the attribute counts, as it does on real SNS.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });
});

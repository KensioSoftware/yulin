import { PublishCommand } from "@aws-sdk/client-sns";
import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";
import { SimSnsUnsimulatedInputException } from "../../error/sim-sns.error.js";

describe("SNS unsimulated publish input", () => {
  it("refuses the publish inputs that are not simulated", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When each unsimulated input is used.
    const refusals = await Promise.all(
      [
        { TargetArn: "arn:aws:sns:us-east-1:888888888888:endpoint/APNS/app/1" },
        { PhoneNumber: "+15550100" },
        { TopicArn: topicArn, MessageStructure: "json" },
        { TopicArn: topicArn, MessageGroupId: "orders" },
        { TopicArn: topicArn, MessageDeduplicationId: "order-1" },
      ].map(async (input) =>
        assertThrowsErrorAsync(async () => {
          await simAws
            .sns()
            .publish(new PublishCommand({ ...input, Message: "order-1" }));
        }),
      ),
    );

    // Then each is refused rather than answered with a message id for a
    // message that reached nothing.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsUnsimulatedInputException);
    }
  });
});

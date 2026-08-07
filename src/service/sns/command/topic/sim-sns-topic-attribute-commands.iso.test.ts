import {
  CreateTopicCommand,
  GetTopicAttributesCommand,
  SetTopicAttributesCommand,
} from "@aws-sdk/client-sns";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";
import {
  SimSnsInvalidParameterException,
  SimSnsUnsimulatedInputException,
} from "../../error/sim-sns.error.js";

const policyDocument = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "s3.amazonaws.com" },
      Action: "SNS:Publish",
      Resource: "arn:aws:sns:us-east-1:888888888888:orders",
    },
  ],
});

describe("SNS topic attribute commands", () => {
  it("sets and reports the display name", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When its display name is set.
    await simAws.sns().setTopicAttributes(
      new SetTopicAttributesCommand({
        TopicArn: topicArn,
        AttributeName: "DisplayName",
        AttributeValue: "Orders",
      }),
    );

    // Then it comes back alongside the counts real SNS reports.
    const read = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: topicArn }),
      );

    assertIdentical(read.Attributes?.["DisplayName"], "Orders");
    assertIdentical(read.Attributes["SubscriptionsConfirmed"], "0");
    assertIdentical(read.Attributes["SubscriptionsPending"], "0");
    assertIdentical(read.Attributes["SubscriptionsDeleted"], "0");
  });

  it("reports a policy back as the string it was set with", async () => {
    // Given a topic with no policy.
    const { simAws, topicArn } = await simAwsWithTopic();

    const before = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: topicArn }),
      );

    assertUndefined(before.Attributes?.["Policy"]);

    // When a policy is set on it.
    await simAws.sns().setTopicAttributes(
      new SetTopicAttributesCommand({
        TopicArn: topicArn,
        AttributeName: "Policy",
        AttributeValue: policyDocument,
      }),
    );

    // Then it comes back byte for byte.
    const read = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: topicArn }),
      );

    assertIdentical(read.Attributes?.["Policy"], policyDocument);
  });

  it("takes a policy off a topic when the attribute is set to nothing", async () => {
    // Given a topic created with a policy.
    const { simAws, topicArn } = await simAwsWithTopic({
      Policy: policyDocument,
    });

    // When the attribute is set with no value.
    await simAws.sns().setTopicAttributes(
      new SetTopicAttributesCommand({
        TopicArn: topicArn,
        AttributeName: "Policy",
      }),
    );

    // Then the topic has none, since there is no DeleteTopicPolicy to use.
    const read = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: topicArn }),
      );

    assertUndefined(read.Attributes?.["Policy"]);
  });

  it("refuses a set with no attribute name", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When an attribute is set without naming one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().setTopicAttributes({ input: { TopicArn: topicArn } });
    });

    // Then the missing input is reported.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });

  it("refuses an attribute real SNS does not have", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When an attribute nothing has is set.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().setTopicAttributes(
        new SetTopicAttributesCommand({
          TopicArn: topicArn,
          AttributeName: "MadeUp",
          AttributeValue: "1",
        }),
      );
    });

    // Then it is refused the way real SNS refuses one.
    assertInstanceOf(error, SimSnsInvalidParameterException);
  });

  it("refuses the attributes real SNS has that are not simulated", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When each unsimulated attribute is set.
    const refusals = await Promise.all(
      [
        "FifoTopic",
        "KmsMasterKeyId",
        "SignatureVersion",
        "ArchivePolicy",
        "DeliveryPolicy",
        "SQSSuccessFeedbackRoleArn",
        "LambdaFailureFeedbackRoleArn",
      ].map(async (attributeName) =>
        assertThrowsErrorAsync(async () => {
          await simAws.sns().setTopicAttributes(
            new SetTopicAttributesCommand({
              TopicArn: topicArn,
              AttributeName: attributeName,
              AttributeValue: "true",
            }),
          );
        }),
      ),
    );

    // Then each is refused by name, rather than taken and ignored.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsUnsimulatedInputException);
      assertStringIncludes(error.message, "not simulated");
    }
  });

  it("refuses an unsimulated attribute at create time too", async () => {
    // Given a topic that already exists under the name being asked for.
    const { simAws } = await simAwsWithTopic();

    // When it is created again asking for encryption.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().createTopic(
        new CreateTopicCommand({
          Name: "orders",
          Attributes: { KmsMasterKeyId: "alias/aws/sns" },
        }),
      );
    });

    // Then it is refused, rather than the idempotent answer quietly accepting
    // an attribute a first create would have been refused for.
    assertInstanceOf(error, SimSnsUnsimulatedInputException);
  });
});

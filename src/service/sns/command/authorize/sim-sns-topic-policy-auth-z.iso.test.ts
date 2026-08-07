import { PublishCommand, SetTopicAttributesCommand } from "@aws-sdk/client-sns";
import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simAwsWithTopicPolicy,
  simSnsOrdersTopicArn as topicArn,
} from "../../../../../test/sns/topic-fixture.js";
import { SimSnsAuthorizationErrorException } from "../../error/sim-sns.error.js";

const s3 = { kind: "service", service: "s3.amazonaws.com" } as const;

const uploads = "arn:aws:s3:::uploads";

/**
 * A topic policy admitting S3 to publish for one Bucket only.
 */
const bucketPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "s3.amazonaws.com" },
      Action: "SNS:Publish",
      Resource: topicArn,
      Condition: { ArnLike: { "aws:SourceArn": uploads } },
    },
  ],
});

describe("SNS topic policy authorization", () => {
  it("admits a service principal the policy names", async () => {
    // Given a topic whose policy admits S3 for one Bucket.
    const simAws = await simAwsWithTopicPolicy(bucketPolicy);

    // When S3 publishes on that Bucket's behalf.
    const published = await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }), {
        caller: s3,
        sourceArn: uploads,
      });

    // Then the topic policy is the whole decision, since S3 owns no identity
    // policies anywhere.
    assertNonNullable(published.MessageId);
  });

  it("refuses a service principal outside the policy's condition", async () => {
    // Given the same topic policy.
    const simAws = await simAwsWithTopicPolicy(bucketPolicy);

    // When S3 publishes on another Bucket's behalf.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .publish(
          new PublishCommand({ TopicArn: topicArn, Message: "order-1" }),
          { caller: s3, sourceArn: "arn:aws:s3:::reports" },
        );
    });

    // Then the condition does not match, so nothing admits it.
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
  });

  it("refuses a request carrying no source ARN at all", async () => {
    // Given the same topic policy.
    const simAws = await simAwsWithTopicPolicy(bucketPolicy);

    // When S3 publishes without saying what it is publishing for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .publish(
          new PublishCommand({ TopicArn: topicArn, Message: "order-1" }),
          { caller: s3 },
        );
    });

    // Then the key is left out rather than supplied empty, so the statement
    // fails to match.
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
  });

  it("refuses a service principal when the topic has no policy", async () => {
    // Given a topic with no policy.
    const simAws = await simAwsWithTopicPolicy();

    // When S3 publishes to it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .publish(
          new PublishCommand({ TopicArn: topicArn, Message: "order-1" }),
          { caller: s3, sourceArn: uploads },
        );
    });

    // Then nothing admits it, since a service principal has no identity
    // policies to fall back on.
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
  });

  it("stops admitting a principal once the policy is taken off", async () => {
    // Given a topic whose policy admits S3.
    const simAws = await simAwsWithTopicPolicy(bucketPolicy);

    // When the policy is removed.
    await simAws.sns().setTopicAttributes(
      new SetTopicAttributesCommand({
        TopicArn: topicArn,
        AttributeName: "Policy",
        AttributeValue: "",
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .publish(
          new PublishCommand({ TopicArn: topicArn, Message: "order-1" }),
          { caller: s3, sourceArn: uploads },
        );
    });

    // Then the decision is made again on every request rather than remembered.
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
  });
});

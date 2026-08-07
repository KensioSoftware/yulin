import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateTopicCommand,
  ListTopicsCommand,
  PublishCommand,
} from "@aws-sdk/client-sns";
import {
  assertArrayLength,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimSnsAuthorizationErrorException } from "../../error/sim-sns.error.js";

/**
 * A simulated AWS with a topic, and a Role allowed only what a policy says.
 */
async function simAwsWithRole(
  statement: object,
): Promise<{ simAws: SimAws; topicArn: string; caller: SimAwsCaller }> {
  const simAws = new SimAws();
  const created = await simAws
    .sns()
    .createTopic(new CreateTopicCommand({ Name: "orders" }));

  assertNonNullable(created.TopicArn);

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "OrderPublisher",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${simAws.defaultAccountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "OrderPublisher",
      PolicyName: "PublishOrders",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return {
    simAws,
    topicArn: created.TopicArn,
    caller: { kind: "arn", arn: role.Role.Arn },
  };
}

describe("SNS IAM authorization", () => {
  it("refuses a caller whose policy does not allow the action", async () => {
    // Given a Role allowed to read a topic and nothing else.
    const { simAws, topicArn, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sns:GetTopicAttributes",
      Resource: "arn:aws:sns:us-east-1:888888888888:orders",
    });

    // When it publishes to the topic.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .publish(
          new PublishCommand({ TopicArn: topicArn, Message: "order-1" }),
          {
            caller,
          },
        );
    });

    // Then it is refused with the error real SNS answers a denial with.
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
    assertStringIncludes(error.message, "sns:Publish");
  });

  it("allows a caller whose policy names the topic ARN", async () => {
    // Given a Role allowed to publish to the topic by ARN.
    const { simAws, topicArn, caller } = await simAwsWithRole({
      Effect: "Allow",
      // A topic ARN has no resource type: not "...:topic/orders".
      Action: "sns:Publish",
      Resource: "arn:aws:sns:us-east-1:888888888888:orders",
    });

    // When it publishes to the topic.
    const published = await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }), {
        caller,
      });

    // Then the message goes through.
    assertNonNullable(published.MessageId);
  });

  it("refuses a policy that names the topic with a resource type", async () => {
    // Given a Role whose policy writes the topic ARN the way an SQS queue ARN
    // is often wrongly written.
    const { simAws, topicArn, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sns:Publish",
      Resource: "arn:aws:sns:us-east-1:888888888888:topic/orders",
    });

    // When it publishes to the topic.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .publish(
          new PublishCommand({ TopicArn: topicArn, Message: "order-1" }),
          {
            caller,
          },
        );
    });

    // Then it matches nothing, as it matches nothing on real AWS.
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
  });

  it("authorizes a batch publish as the singular action", async () => {
    // Given a Role allowed only sns:Publish, which is the only publish action
    // real SNS has.
    const { simAws, topicArn, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sns:Publish",
      Resource: "arn:aws:sns:us-east-1:888888888888:orders",
    });

    // When it publishes a batch.
    const published = await simAws.sns().publishBatch(
      {
        input: {
          TopicArn: topicArn,
          PublishBatchRequestEntries: [{ Id: "one", Message: "order-1" }],
        },
      },
      { caller },
    );

    // Then the batch goes through, since there is no sns:PublishBatch action.
    assertArrayLength(published.Successful, 1);
  });

  it("gives listing no topic-level permission", async () => {
    // Given a Role allowed to list topics by naming one topic ARN.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sns:ListTopics",
      Resource: "arn:aws:sns:us-east-1:888888888888:orders",
    });

    // When it lists the topics.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().listTopics(new ListTopicsCommand({}), { caller });
    });

    // Then the policy allows nothing, as real SNS gives ListTopics no
    // topic-level permission.
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
    assertStringIncludes(error.message, ":*");
  });

  it("refuses a caller with no permission for a topic that does not exist", async () => {
    // Given a Role allowed nothing to do with SNS.
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "s3:GetObject",
      Resource: "*",
    });

    // When it reaches for a topic that is not there.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().publish(
        new PublishCommand({
          TopicArn: "arn:aws:sns:us-east-1:888888888888:invoices",
          Message: "order-1",
        }),
        { caller },
      );
    });

    // Then the denial comes first, because a topic that is not there
    // contributes no policy and cannot admit anyone.
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
  });
});

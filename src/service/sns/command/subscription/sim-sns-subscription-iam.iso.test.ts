import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  ListSubscriptionsCommand,
  SubscribeCommand,
  UnsubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simAwsWithTopic,
  simSnsOrdersTopicArn,
} from "../../../../../test/sns/topic-fixture.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimSnsAuthorizationErrorException } from "../../error/sim-sns.error.js";

const queueArn = "arn:aws:sqs:us-east-1:888888888888:orders-queue";

/**
 * A simulated AWS with a topic, and a Role allowed only what a policy says.
 */
async function simAwsWithRole(statement: object): Promise<{
  simAws: SimAws;
  topicArn: string;
  caller: SimAwsCaller;
}> {
  const { simAws, topicArn } = await simAwsWithTopic();
  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "OrderSubscriber",
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
      RoleName: "OrderSubscriber",
      PolicyName: "SubscribeOrders",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return { simAws, topicArn, caller: { kind: "arn", arn: role.Role.Arn } };
}

describe("SNS subscription IAM authorization", () => {
  it("authorizes Subscribe against the topic's own ARN", async () => {
    // Given a Role allowed to subscribe to this topic and nothing else.
    const { simAws, topicArn, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sns:Subscribe",
      Resource: simSnsOrdersTopicArn,
    });

    // When it subscribes a queue to the topic.
    const subscribed = await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueArn,
      }),
      { caller },
    );

    // Then it is allowed, because a topic ARN is the resource SNS authorizes
    // this action against.
    assertNonNullable(subscribed.SubscriptionArn);
  });

  it("refuses a caller whose policy does not allow subscribing", async () => {
    // Given a Role allowed to publish to the topic and nothing else.
    const { simAws, topicArn, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "sns:Publish",
      Resource: simSnsOrdersTopicArn,
    });

    // When it subscribes a queue to the topic.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().subscribe(
        new SubscribeCommand({
          TopicArn: topicArn,
          Protocol: "sqs",
          Endpoint: queueArn,
        }),
        { caller },
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
  });

  it("authorizes Unsubscribe against no resource at all", async () => {
    // Given a Role allowed to subscribe to the topic, and to unsubscribe only
    // where the resource is everything.
    const { simAws, topicArn, caller } = await simAwsWithRole([
      {
        Effect: "Allow",
        Action: "sns:Subscribe",
        Resource: simSnsOrdersTopicArn,
      },
      { Effect: "Allow", Action: "sns:Unsubscribe", Resource: "*" },
    ]);
    const subscribed = await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueArn,
      }),
      { caller },
    );

    // When it unsubscribes.
    await simAws.sns().unsubscribe(
      new UnsubscribeCommand({
        SubscriptionArn: subscribed.SubscriptionArn,
      }),
      { caller },
    );

    // Then it is allowed. Real SNS gives Unsubscribe no resource type, so IAM
    // evaluates it against `*` and a policy naming the topic ARN grants
    // nothing.
    assertNonNullable(subscribed.SubscriptionArn);
  });

  it("refuses Unsubscribe to a policy naming the topic ARN", async () => {
    // Given a Role allowed both actions on the topic's ARN.
    const { simAws, topicArn, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: ["sns:Subscribe", "sns:Unsubscribe", "sns:ListSubscriptions"],
      Resource: simSnsOrdersTopicArn,
    });
    const subscribed = await simAws.sns().subscribe(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: queueArn,
      }),
      { caller },
    );

    // When it unsubscribes, and lists its subscriptions.
    const refusals = await Promise.all([
      assertThrowsErrorAsync(async () => {
        await simAws.sns().unsubscribe(
          new UnsubscribeCommand({
            SubscriptionArn: subscribed.SubscriptionArn,
          }),
          { caller },
        );
      }),
      assertThrowsErrorAsync(async () => {
        await simAws
          .sns()
          .listSubscriptions(new ListSubscriptionsCommand({}), { caller });
      }),
    ]);

    // Then both are refused, as they are on real AWS: neither action has a
    // resource type, so only `*` grants them.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsAuthorizationErrorException);
    }
  });
});

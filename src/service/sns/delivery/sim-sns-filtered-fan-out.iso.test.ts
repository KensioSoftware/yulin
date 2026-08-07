import {
  PublishCommand,
  SetSubscriptionAttributesCommand,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  CreateQueueCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simSnsDeliveredMessage,
  simSnsQueuePolicy,
} from "../../../../test/sns/subscription-fixture.js";
import { simAwsWithTopic } from "../../../../test/sns/topic-fixture.js";
import type { SimAws } from "../../aws/sim-aws.js";

/**
 * Subscribe a queue to the topic with a filter policy of its own.
 */
async function subscribeFiltering(
  simAws: SimAws,
  queueName: string,
  topicArn: string,
  attributes: Record<string, string>,
): Promise<string> {
  const sqs = simAws.sqs();
  const created = await sqs.createQueue(
    new CreateQueueCommand({ QueueName: queueName }),
  );
  const queueArn = `arn:aws:sqs:us-east-1:888888888888:${queueName}`;

  await sqs.setQueueAttributes(
    new SetQueueAttributesCommand({
      QueueUrl: created.QueueUrl,
      Attributes: { Policy: simSnsQueuePolicy(queueArn, topicArn) },
    }),
  );

  await simAws.sns().subscribe(
    new SubscribeCommand({
      TopicArn: topicArn,
      Protocol: "sqs",
      Endpoint: queueArn,
      Attributes: attributes,
    }),
  );

  assertNonNullable(created.QueueUrl);

  return created.QueueUrl;
}

/**
 * The `Message` a delivered envelope carries.
 */
function envelopeMessage(body: string | undefined): unknown {
  assertNonNullable(body);

  return (JSON.parse(body) as Record<string, unknown>)["Message"];
}

describe("SNS fan-out with subscription filter policies", () => {
  it("delivers to the subscriptions whose policy matches", async () => {
    // Given a topic with three queues subscribed to it: one taking orders, one
    // taking refunds, and one with no policy at all.
    const { simAws, topicArn } = await simAwsWithTopic();
    const orders = await subscribeFiltering(simAws, "orders-q", topicArn, {
      FilterPolicy: JSON.stringify({ type: ["order"] }),
    });
    const refunds = await subscribeFiltering(simAws, "refunds-q", topicArn, {
      FilterPolicy: JSON.stringify({ type: ["refund"] }),
    });
    const audit = await subscribeFiltering(simAws, "audit-q", topicArn, {});

    // When an order is published.
    await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Message: "order-1",
        MessageAttributes: {
          type: { DataType: "String", StringValue: "order" },
        },
      }),
    );

    // Then it reaches the queue whose policy matches and the one filtering
    // nothing, and the other subscription's policy has nothing to do with it.
    assertIdentical(
      envelopeMessage(await simSnsDeliveredMessage(simAws, orders)),
      "order-1",
    );
    assertIdentical(
      envelopeMessage(await simSnsDeliveredMessage(simAws, audit)),
      "order-1",
    );
    assertUndefined(await simSnsDeliveredMessage(simAws, refunds));
  });

  it("filters on the message body when the scope says to", async () => {
    // Given a queue subscribed with a policy about the body.
    const { simAws, topicArn } = await simAwsWithTopic();
    const gold = await subscribeFiltering(simAws, "gold-q", topicArn, {
      FilterPolicy: JSON.stringify({ customer: { tier: ["gold"] } }),
      FilterPolicyScope: "MessageBody",
    });

    // When a body naming another tier is published, and then one naming gold.
    await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify({ customer: { tier: "silver" } }),
      }),
    );

    assertUndefined(await simSnsDeliveredMessage(simAws, gold));

    await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify({ customer: { tier: "gold" } }),
      }),
    );

    // Then only the second one is delivered.
    assertIdentical(
      envelopeMessage(await simSnsDeliveredMessage(simAws, gold)),
      JSON.stringify({ customer: { tier: "gold" } }),
    );
  });

  it("delivers a body that is not JSON to nothing filtering on one", async () => {
    // Given a queue filtering on the message body.
    const { simAws, topicArn } = await simAwsWithTopic();
    const queueUrl = await subscribeFiltering(simAws, "body-q", topicArn, {
      FilterPolicy: JSON.stringify({ type: ["order"] }),
      FilterPolicyScope: "MessageBody",
    });

    // When a message that is not JSON at all is published.
    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

    // Then nothing is delivered and nothing failed: a body with no keys in it
    // matches no policy.
    assertUndefined(await simSnsDeliveredMessage(simAws, queueUrl));
    assertArrayLength(simAws.sns().deliveryFailures, 0);
  });

  it("stops filtering when the policy is taken off again", async () => {
    // Given a queue subscribed with a policy nothing published matches.
    const { simAws, topicArn } = await simAwsWithTopic();
    const queueUrl = await subscribeFiltering(simAws, "orders-q", topicArn, {
      FilterPolicy: JSON.stringify({ type: ["refund"] }),
    });
    const [subscription] = simAws.sns().topicSubscriptions("orders");

    assertNonNullable(subscription);

    // When the policy is cleared by setting it with no value.
    await simAws.sns().setSubscriptionAttributes(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscription.arn.value,
        AttributeName: "FilterPolicy",
        AttributeValue: undefined,
      }),
    );

    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

    // Then the subscription is back to receiving everything.
    assertIdentical(
      envelopeMessage(await simSnsDeliveredMessage(simAws, queueUrl)),
      "order-1",
    );
  });
});

import { RemovePermissionCommand } from "@aws-sdk/client-lambda";
import { PublishCommand } from "@aws-sdk/client-sns";
import {
  assertArrayLength,
  assertFalse,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimAws } from "../../../aws/sim-aws.js";
import {
  simSnsAllowInvoke,
  simSnsFunctionArn,
  simSnsSubscribedFunction,
  subscribeFunction,
} from "../../../../../test/sns/function-fixture.js";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";
import type { SimSnsDeliveryFailure } from "../sim-sns-delivery-failures.js";

/**
 * Publish one message and wait for whatever delivery it caused.
 */
async function publishOrder(simAws: SimAws, topicArn: string): Promise<void> {
  await simAws
    .sns()
    .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

  await simAws.backgroundTasksComplete();
}

/**
 * The one delivery a topic could not make.
 */
function onlyFailure(simAws: SimAws): SimSnsDeliveryFailure {
  const failures = simAws.sns().deliveryFailures;

  assertArrayLength(failures, 1);

  const [failure] = failures;

  assertNonNullable(failure);

  return failure;
}

describe("SNS delivery to a Lambda function it may invoke", () => {
  it("does not invoke a function that does not admit SNS", async () => {
    // Given a topic with a function subscribed to it and no invoke permission.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
      topicArn,
      { withoutPermission: true },
    );

    // When a message is published.
    await publishOrder(simAws, topicArn);

    // Then nothing was invoked, and the refusal says what to grant.
    assertArrayLength(consumer.events, 0);

    const failure = onlyFailure(simAws);

    assertTrue(failure.wasRefused);
    assertStringIncludes(failure.reason, "does not allow sns.amazonaws.com");
    assertStringIncludes(failure.reason, "AddPermission");
  });

  it("stops delivering when the permission is taken away", async () => {
    // Given a topic with a function subscribed to it and allowed to be
    // invoked, which receives a first message.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
      topicArn,
    );

    await publishOrder(simAws, topicArn);
    assertArrayLength(consumer.events, 1);

    // When the permission is removed after subscribing.
    await simAws.lambda().removePermission(
      new RemovePermissionCommand({
        FunctionName: "order-consumer",
        StatementId: "AllowSns",
      }),
    );

    await publishOrder(simAws, topicArn);

    // Then the second message is not delivered. The resource policy is
    // consulted on every delivery rather than remembered from Subscribe time.
    assertArrayLength(consumer.events, 1);
    assertTrue(onlyFailure(simAws).wasRefused);
  });

  it("does not invoke a function granted for another topic", async () => {
    // Given a function subscribed to a topic, admitting SNS for a different
    // one.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
      topicArn,
      { withoutPermission: true },
    );

    await simSnsAllowInvoke(
      simAws,
      "order-consumer",
      "arn:aws:sns:us-east-1:888888888888:invoices",
    );

    // When a message is published on the topic it is subscribed to.
    await publishOrder(simAws, topicArn);

    // Then the grant does not reach it, because it names another topic as its
    // source ARN.
    assertArrayLength(consumer.events, 0);
    assertTrue(onlyFailure(simAws).wasRefused);
  });

  it("invokes a function in another Account that admits the topic", async () => {
    // Given a topic with a function in another Account subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
      topicArn,
      { accountId: "222222222222" },
    );

    // When a message is published.
    await publishOrder(simAws, topicArn);

    // Then it is invoked, because that Account's resource policy admits SNS
    // for this topic.
    assertArrayLength(consumer.events, 1);
    assertStringIncludes(consumer.functionArn, "222222222222");
  });

  it("invokes a function in another Region", async () => {
    // Given a topic with a function in another Region subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
      topicArn,
      { regionName: "eu-west-2" },
    );

    // When a message is published.
    await publishOrder(simAws, topicArn);

    // Then it is invoked, since real SNS invokes across Regions.
    assertArrayLength(consumer.events, 1);
  });

  it("records a subscription pointing at no function at all", async () => {
    // Given a topic subscribed to a function that was never created.
    const { simAws, topicArn } = await simAwsWithTopic();
    const missing = simSnsFunctionArn(simAws, "order-consumer");

    await subscribeFunction(simAws, topicArn, missing);

    // When a message is published.
    await publishOrder(simAws, topicArn);

    // Then the missing function is reported rather than treated as a refusal,
    // because no resource policy said no: there was nothing to ask.
    const failure = onlyFailure(simAws);

    assertFalse(failure.wasRefused);
    assertStringIncludes(failure.reason, "not a simulated Lambda function");
  });

  it("keeps delivering to the other subscriptions when a handler throws", async () => {
    // Given a topic with a failing function and a working one subscribed.
    const { simAws, topicArn } = await simAwsWithTopic();
    const failing = await simSnsSubscribedFunction(
      simAws,
      "order-failer",
      topicArn,
      {
        onEvent: () => {
          throw new Error("handler blew up");
        },
      },
    );
    const working = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
      topicArn,
    );

    // When a message is published.
    await publishOrder(simAws, topicArn);

    // Then both were invoked, and only the failing one is a delivery failure.
    assertArrayLength(failing.events, 1);
    assertArrayLength(working.events, 1);
    assertStringIncludes(onlyFailure(simAws).reason, "handler blew up");
  });

  it("invokes a function subscribed after its permission was granted", async () => {
    // Given a function allowed to be invoked before it is subscribed.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simSnsSubscribedFunction(
      simAws,
      "order-consumer",
      topicArn,
      { withoutPermission: true },
    );

    await simSnsAllowInvoke(simAws, "order-consumer", topicArn);

    // When a message is published.
    await publishOrder(simAws, topicArn);

    // Then it is invoked, since the permission is read at delivery time rather
    // than at Subscribe time.
    assertArrayLength(consumer.events, 1);
  });
});

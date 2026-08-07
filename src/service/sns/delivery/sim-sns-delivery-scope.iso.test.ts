import { PublishCommand } from "@aws-sdk/client-sns";
import { CreateQueueCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { BackgroundTasks } from "../../../util/background/background.js";
import {
  simSnsDeliveredMessage,
  simSnsSubscribedQueue,
} from "../../../../test/sns/subscription-fixture.js";
import { simAwsWithTopic } from "../../../../test/sns/topic-fixture.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account-id.js";
import { SimSns } from "../sim-sns.js";
import { SimSnsDeliveryNotPermitted } from "../error/sim-sns-delivery.error.js";

/**
 * The `Message` a delivered envelope carries.
 */
function envelopeMessage(body: string | undefined): unknown {
  assertNonNullable(body);

  return (JSON.parse(body) as Record<string, unknown>)["Message"];
}

describe("SNS delivery across Accounts and Regions", () => {
  it("delivers to a queue in another Region", async () => {
    // Given a topic with a queue in another Region subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const scope = { regionName: "eu-west-2" } as const;
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "orders",
      topicArn,
      scope,
    );

    // When a message is published.
    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

    // Then it reaches the queue. Real SNS delivers across Regions, which is a
    // deliberate difference from simulated S3 event notifications: real S3
    // requires the destination queue to be in the Bucket's Region.
    assertIdentical(
      envelopeMessage(await simSnsDeliveredMessage(simAws, queueUrl, scope)),
      "order-1",
    );
  });

  it("delivers to a queue in another Account", async () => {
    // Given a topic with a queue in another Account subscribed to it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const scope = { accountId: "222222222222" } as const;
    const { queueUrl } = await simSnsSubscribedQueue(
      simAws,
      "orders",
      topicArn,
      scope,
    );

    // When a message is published.
    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

    // Then it reaches the queue, because that Account's queue policy admits
    // SNS for this topic.
    assertIdentical(
      envelopeMessage(await simSnsDeliveredMessage(simAws, queueUrl, scope)),
      "order-1",
    );
  });

  it("does not deliver to a queue whose policy does not admit SNS", async () => {
    // Given a topic with a queue subscribed to it that has no policy at all.
    const { simAws, topicArn } = await simAwsWithTopic();
    const created = await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

    await simAws.sns().subscribe({
      input: {
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: "arn:aws:sqs:us-east-1:888888888888:orders",
      },
    });

    // When a message is published.
    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

    // Then nothing reaches the queue.
    assertUndefined(
      await simSnsDeliveredMessage(simAws, created.QueueUrl ?? ""),
    );

    // And the refusal is recorded rather than swallowed, so a queue that is
    // unexpectedly empty says why.
    const failures = simAws.sns().deliveryFailures;

    assertArrayLength(failures, 1);
    assertNonNullable(failures[0]);
    assertInstanceOf(failures[0].error, SimSnsDeliveryNotPermitted);
    assertTrue(failures[0].wasRefused);
    assertStringIncludes(
      failures[0].reason,
      "does not allow sns.amazonaws.com",
    );
  });

  it("records a delivery a simulated SNS on its own cannot make", async () => {
    // Given a simulated SNS built on its own, with a subscription on it.
    const background = new BackgroundTasks();
    const simSns = new SimSns({
      background,
      accountRegionScope: {
        accountId: "333333333333" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
    });
    const topicArn = "arn:aws:sns:eu-west-2:333333333333:orders";

    await simSns.createTopic({ input: { Name: "orders" } });
    await simSns.subscribe({
      input: {
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: "arn:aws:sqs:eu-west-2:333333333333:orders",
      },
    });

    // When a message is published.
    await simSns.publish({ input: { TopicArn: topicArn, Message: "order-1" } });
    await background.complete();

    // Then the delivery is refused, because there is no other simulated
    // service to reach, and the reason says how to get one.
    const failures = simSns.deliveryFailures;

    assertArrayLength(failures, 1);
    assertNonNullable(failures[0]);
    assertStringIncludes(
      failures[0].reason,
      "Reach simulated SNS through SimAws",
    );
  });

  it("does not deliver to a queue that is not there", async () => {
    // Given a topic subscribed to a queue nothing created.
    const { simAws, topicArn } = await simAwsWithTopic();

    await simAws.sns().subscribe({
      input: {
        TopicArn: topicArn,
        Protocol: "sqs",
        Endpoint: "arn:aws:sqs:us-east-1:888888888888:missing",
      },
    });

    // When two messages are published.
    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));
    await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-2" }));

    await simAws.backgroundTasksComplete();

    // Then both failures are kept and each names the queue, since real SNS
    // does not check the endpoint exists at Subscribe time either. Only the
    // first is warned about, so a broken endpoint does not fill the output.
    const failures = simAws.sns().deliveryFailures;

    assertArrayLength(failures, 2);
    assertNonNullable(failures[0]);
    assertNonNullable(failures[1]);
    assertStringIncludes(failures[0].reason, "is not a simulated SQS queue");
    assertStringIncludes(failures[1].reason, "is not a simulated SQS queue");
  });
});

import { PublishCommand } from "@aws-sdk/client-sns";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simLambdaAliasedFunction,
  simLambdaAllowAliasInvoke,
} from "../../../../../test/lambda/alias-fixture.js";
import { subscribeFunction } from "../../../../../test/sns/function-fixture.js";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import { simSnsServicePrincipal } from "../sim-sns-delivery.js";

/**
 * Publish one message and wait for whatever delivery it caused.
 */
async function publishOrder(simAws: SimAws, topicArn: string): Promise<void> {
  await simAws
    .sns()
    .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

  await simAws.backgroundTasksComplete();
}

describe("SNS delivery to a Lambda alias", () => {
  it("delivers to the version the alias points at", async () => {
    // Given a topic and a function whose alias admits SNS for it.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simLambdaAliasedFunction(simAws, "order-consumer");
    await simLambdaAllowAliasInvoke(
      simAws,
      "order-consumer",
      simSnsServicePrincipal,
      topicArn,
    );
    await subscribeFunction(simAws, topicArn, consumer.aliasArn);

    // When a message is published.
    await publishOrder(simAws, topicArn);

    // Then the version behind the alias ran, rather than `$LATEST`.
    assertArrayEquals(consumer.ranAs, [consumer.version]);
    assertArrayEmpty(simAws.sns().deliveryFailures);
  });

  it("reports an endpoint naming no version or alias", async () => {
    // Given a topic and a function subscribed by an alias it does not have.
    const { simAws, topicArn } = await simAwsWithTopic();
    const consumer = await simLambdaAliasedFunction(simAws, "order-consumer");
    await simLambdaAllowAliasInvoke(
      simAws,
      "order-consumer",
      simSnsServicePrincipal,
      topicArn,
    );
    await subscribeFunction(simAws, topicArn, `${consumer.functionArn}:old`);

    // When a message is published.
    await publishOrder(simAws, topicArn);

    // Then nothing ran, and the failure says the qualifier reaches nothing.
    // Real SNS checks no endpoint at `Subscribe` time, so this is where a
    // subscription pointing at nothing is found, as it is for a function that
    // is not there.
    assertArrayEmpty(consumer.ranAs);

    const [failure] = simAws.sns().deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(
      failure.reason,
      "names no simulated Lambda function version or alias",
    );
  });
});

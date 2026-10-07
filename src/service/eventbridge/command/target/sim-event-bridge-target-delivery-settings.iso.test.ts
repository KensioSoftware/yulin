import {
  ListTargetsByRuleCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimEventBridgeValidationException } from "../../error/sim-event-bridge.error.js";

describe("EventBridge target retry policies and dead-letter queues", () => {
  const queueArn = "arn:aws:sqs:us-east-1:888888888888:orders";
  const dlqArn = "arn:aws:sqs:us-east-1:888888888888:undelivered-orders";

  /**
   * A simulation with an `orders` rule to add targets to.
   */
  async function simAwsWithRule(): Promise<SimAws> {
    const simAws = new SimAws();

    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "orders",
        EventPattern: JSON.stringify({ source: ["orders.service"] }),
      }),
    );

    return simAws;
  }

  it("keeps a target's retry policy and dead-letter queue as written", async () => {
    // Given a rule.
    const simAws = await simAwsWithRule();

    // When a target is added with a retry policy and a dead-letter queue.
    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [
          {
            Id: "orders",
            Arn: queueArn,
            RetryPolicy: { MaximumRetryAttempts: 0 },
            DeadLetterConfig: { Arn: dlqArn },
          },
        ],
      }),
    );

    // Then listing the targets reports both as they were written.
    const listed = await simAws
      .eventBridge()
      .listTargetsByRule(new ListTargetsByRuleCommand({ Rule: "orders" }));
    const target = listed.Targets?.[0];

    assertNonNullable(target);
    assertObjectEquals(target.RetryPolicy, { MaximumRetryAttempts: 0 });
    assertObjectEquals(target.DeadLetterConfig, { Arn: dlqArn });
  });

  it("refuses retry limits outside EventBridge's ranges", async () => {
    // Given a rule.
    const simAws = await simAwsWithRule();

    // When targets are added with each limit out of range in turn.
    const policies = [
      { MaximumRetryAttempts: 186 },
      { MaximumRetryAttempts: -1 },
      { MaximumRetryAttempts: 1.5 },
      { MaximumEventAgeInSeconds: 59 },
      { MaximumEventAgeInSeconds: 86_401 },
    ];

    // Then each is refused, naming the limit.
    for (const policy of policies) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await assertThrowsErrorAsync(async () => {
        await simAws.eventBridge().putTargets(
          new PutTargetsCommand({
            Rule: "orders",
            Targets: [{ Id: "orders", Arn: queueArn, RetryPolicy: policy }],
          }),
        );
      });

      assertInstanceOf(error, SimEventBridgeValidationException);
      assertStringIncludes(error.message, Object.keys(policy)[0] ?? "");
    }
  });
});

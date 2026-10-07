import {
  PutRuleCommand,
  PutTargetsCommand,
  type Target,
} from "@aws-sdk/client-eventbridge";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimEventBridgeValidationException } from "../../error/sim-event-bridge.error.js";

describe("EventBridge target dead-letter queue validation", () => {
  const queueArn = "arn:aws:sqs:us-east-1:888888888888:orders";

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

  it("refuses a dead-letter queue that is not a standard SQS queue", async () => {
    // Given a rule.
    const simAws = await simAwsWithRule();

    // When targets name a topic, a FIFO queue and no ARN for a dead-letter
    // queue.
    const configs: Target["DeadLetterConfig"][] = [
      { Arn: "arn:aws:sns:us-east-1:888888888888:undelivered-orders" },
      { Arn: "arn:aws:sqs:us-east-1:888888888888:undelivered-orders.fifo" },
      {},
    ];

    // Then each is refused, since EventBridge takes only a standard queue.
    for (const config of configs) {
      // oxlint-disable-next-line no-await-in-loop
      const error = await assertThrowsErrorAsync(async () => {
        await simAws.eventBridge().putTargets(
          new PutTargetsCommand({
            Rule: "orders",
            Targets: [
              { Id: "orders", Arn: queueArn, DeadLetterConfig: config },
            ],
          }),
        );
      });

      assertInstanceOf(error, SimEventBridgeValidationException);
      assertStringIncludes(error.message, "standard SQS queue");
    }
  });
});

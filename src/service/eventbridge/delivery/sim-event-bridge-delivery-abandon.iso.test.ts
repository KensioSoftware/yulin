import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimEventBridgeTargetNotFound } from "../error/sim-event-bridge-delivery.error.js";
import {
  putOrder,
  retrySimulation,
} from "./sim-event-bridge-delivery-retries.test-support.js";

describe("EventBridge abandoned deliveries", () => {
  const dlqArn = "arn:aws:sqs:us-east-1:888888888888:undelivered-orders";

  it("sends a missing target's event on without retrying it", async () => {
    // Given a target that is not there.
    const simulation = retrySimulation({
      error: new SimEventBridgeTargetNotFound("no such queue"),
    });

    // When an event matches its rule and time passes.
    await putOrder(simulation, {
      RetryPolicy: { MaximumRetryAttempts: 5 },
      DeadLetterConfig: { Arn: dlqArn },
    });
    await simulation.clock.advanceBy({ minutes: 1 });

    // Then it was tried once, and sent on with no retry limit named.
    assertArrayLength(simulation.attempts, 1);
    assertArrayLength(simulation.deadLetters, 1);
    assertUndefined(simulation.deadLetters[0].exhaustedCondition);
    assertInstanceOf(
      simulation.deadLetters[0].error,
      SimEventBridgeTargetNotFound,
    );
  });

  it("delivers once and records the failure for a target with no policy", async () => {
    // Given a target that always fails, with neither a policy nor a queue.
    const simulation = retrySimulation({});

    // When an event matches its rule and time passes.
    await putOrder(simulation, {});
    await simulation.clock.advanceBy({ minutes: 1 });

    // Then it was tried once and the failure is readable.
    assertArrayLength(simulation.attempts, 1);
    assertArrayLength(simulation.eventBridge.deliveryFailures, 1);
  });

  it("records the failure when the dead-letter queue refuses it too", async () => {
    // Given a target and a dead-letter queue that both refuse.
    const simulation = retrySimulation({ deadLetterRefused: true });

    // When an event matches its rule.
    await putOrder(simulation, { DeadLetterConfig: { Arn: dlqArn } });

    // Then the dead-letter queue's refusal is what is recorded.
    assertArrayLength(simulation.eventBridge.deliveryFailures, 1);
    assertIdentical(
      simulation.eventBridge.deliveryFailures[0].message,
      "dead-letter queue refused",
    );
  });
});

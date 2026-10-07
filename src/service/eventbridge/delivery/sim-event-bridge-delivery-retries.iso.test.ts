import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  putOrder,
  retrySimulation,
} from "./sim-event-bridge-delivery-retries.test-support.js";

describe("EventBridge delivery retries", () => {
  const dlqArn = "arn:aws:sqs:us-east-1:888888888888:undelivered-orders";

  it("retries with doubling waits only as simulated time advances", async () => {
    // Given a target that succeeds on its third attempt.
    const simulation = retrySimulation({ succeedsOnAttempt: 3 });

    // When an event matches its rule, and time moves to each retry instant.
    await putOrder(simulation, {
      RetryPolicy: { MaximumRetryAttempts: 5 },
      DeadLetterConfig: { Arn: dlqArn },
    });
    assertArrayLength([...simulation.attempts], 1);

    await simulation.clock.advanceBy({ milliseconds: 999 });
    assertArrayLength([...simulation.attempts], 1);

    await simulation.clock.advanceBy({ milliseconds: 1 });
    await simulation.clock.advanceBy({ seconds: 2 });

    // Then the waits were one second and two, and success left nothing over.
    assertArrayLength(simulation.attempts, 3);
    assertIdentical(
      simulation.attempts[2].getTime() - simulation.attempts[1].getTime(),
      2000,
    );
    assertArrayEmpty(simulation.deadLetters);
    assertArrayEmpty(simulation.eventBridge.deliveryFailures);
  });

  it("sends an event to the dead-letter queue once its retries run out", async () => {
    // Given a target that always fails, with two retries allowed.
    const simulation = retrySimulation({});

    // When an event matches its rule and time passes the retries.
    await putOrder(simulation, {
      RetryPolicy: { MaximumRetryAttempts: 2 },
      DeadLetterConfig: { Arn: dlqArn },
    });
    await simulation.clock.advanceBy({ minutes: 1 });

    // Then it was tried three times and then sent on, saying why.
    assertArrayLength(simulation.attempts, 3);
    assertArrayLength(simulation.deadLetters, 1);
    assertIdentical(simulation.deadLetters[0].retryAttempts, 2);
    assertIdentical(
      simulation.deadLetters[0].exhaustedCondition,
      "MaximumRetryAttempts",
    );
    assertArrayEmpty(simulation.eventBridge.deliveryFailures);
  });

  it("gives up once the event is older than the policy allows", async () => {
    // Given a target that always fails, with the default 185 retries and a
    // minute's age.
    const simulation = retrySimulation({});

    // When an event matches its rule and well over a minute passes.
    await putOrder(simulation, {
      RetryPolicy: { MaximumEventAgeInSeconds: 60 },
      DeadLetterConfig: { Arn: dlqArn },
    });
    await simulation.clock.advanceBy({ minutes: 10 });

    // Then the retries due within the minute ran, and the event age ran out.
    assertArrayLength(simulation.attempts, 6);
    assertArrayLength(simulation.deadLetters, 1);
    assertIdentical(
      simulation.deadLetters[0].exhaustedCondition,
      "MaximumEventAgeInSeconds",
    );
  });
});

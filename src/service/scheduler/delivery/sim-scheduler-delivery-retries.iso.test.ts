import { CreateScheduleCommand } from "@aws-sdk/client-scheduler";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { BackgroundTasks } from "../../../util/background/background.js";
import { SimClockControl } from "../../../util/clock/sim-clock-control.js";
import { SimControllableClock } from "../../../util/clock/sim-controllable-clock.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimScheduler } from "../sim-scheduler.js";
import type {
  SimSchedulerDeadLetterRequest,
  SimSchedulerDeliveryRequest,
  SimSchedulerDeliveryTargets,
} from "./sim-scheduler-delivery.js";

const startedAt = new Date("2026-07-26T09:00:00.000Z");
const functionArn = "arn:aws:lambda:us-east-1:888888888888:function:reconcile";
const roleArn = "arn:aws:iam::888888888888:role/SchedulerRole";

interface RetrySimulation {
  readonly scheduler: SimScheduler;
  readonly clock: SimClockControl;
  readonly attempts: Date[];
  readonly deadLetters: SimSchedulerDeadLetterRequest[];
}

/**
 * A Scheduler whose target fails until the requested attempt succeeds.
 */
function retrySimulation(succeedsOnAttempt?: number): RetrySimulation {
  const clock = new SimControllableClock({
    base: new SimFixedClock(startedAt),
  });
  const background = new BackgroundTasks({ clock });
  const attempts: Date[] = [];
  const deadLetters: SimSchedulerDeadLetterRequest[] = [];
  const endpoints: SimSchedulerDeliveryTargets = {
    deliver(_request: SimSchedulerDeliveryRequest): Promise<void> {
      attempts.push(clock.now());

      if (attempts.length === succeedsOnAttempt) {
        return Promise.resolve();
      }

      return Promise.reject(new Error("target unavailable"));
    },
    deadLetter(request: SimSchedulerDeadLetterRequest): Promise<void> {
      deadLetters.push(request);
      return Promise.resolve();
    },
  };

  return {
    scheduler: new SimScheduler({ background, deliveryTargets: endpoints }),
    clock: new SimClockControl({ clock, background }),
    attempts,
    deadLetters,
  };
}

async function createRetryingSchedule(
  simulation: RetrySimulation,
  policy: {
    readonly MaximumEventAgeInSeconds?: number;
    readonly MaximumRetryAttempts?: number;
  },
): Promise<void> {
  await simulation.scheduler.createSchedule(
    new CreateScheduleCommand({
      Name: "nightly-report",
      ScheduleExpression: "at(2026-07-26T10:00:00)",
      FlexibleTimeWindow: { Mode: "OFF" },
      Target: {
        Arn: functionArn,
        RoleArn: roleArn,
        Input: '{"report":"nightly"}',
        DeadLetterConfig: {
          Arn: "arn:aws:sqs:us-east-1:888888888888:failed-schedules",
        },
        RetryPolicy: policy,
      },
    }),
  );
}

describe("Scheduler delivery retries", () => {
  it("retries with deterministic backoff only as simulated time advances", async () => {
    // Given a target that succeeds on its third delivery attempt.
    const simulation = retrySimulation(3);

    await createRetryingSchedule(simulation, {
      MaximumEventAgeInSeconds: 60,
      MaximumRetryAttempts: 3,
    });

    // When the schedule fires, less than the first one-second delay passes,
    // and then the first and second retry instants arrive.
    await simulation.clock.advanceBy({ hours: 1 });
    assertArrayLength([...simulation.attempts], 1);

    await simulation.clock.advanceBy({ milliseconds: 999 });
    assertArrayLength([...simulation.attempts], 1);

    await simulation.clock.advanceBy({ milliseconds: 1 });
    assertArrayLength([...simulation.attempts], 2);

    await simulation.clock.advanceBy({ seconds: 2 });

    // Then the waits were one and two seconds, and success sent no dead letter.
    assertArrayLength(simulation.attempts, 3);
    assertIdentical(
      simulation.attempts[0].toISOString(),
      "2026-07-26T10:00:00.000Z",
    );
    assertIdentical(
      simulation.attempts[1].toISOString(),
      "2026-07-26T10:00:01.000Z",
    );
    assertIdentical(
      simulation.attempts[2].toISOString(),
      "2026-07-26T10:00:03.000Z",
    );
    assertArrayEmpty(simulation.deadLetters);
    assertArrayEmpty(simulation.scheduler.deliveryFailures);
  });

  it("dead-letters after the maximum retry attempts", async () => {
    // Given a target that keeps failing and allows two retries.
    const simulation = retrySimulation();

    await createRetryingSchedule(simulation, {
      MaximumEventAgeInSeconds: 60,
      MaximumRetryAttempts: 2,
    });

    // When enough simulated time passes for both retries.
    await simulation.clock.advanceBy({ hours: 1, seconds: 3 });

    // Then the initial attempt and two retries ran before the event was sent on.
    assertArrayLength(simulation.attempts, 3);
    assertArrayLength(simulation.deadLetters, 1);
    assertIdentical(simulation.deadLetters[0].retryAttempts, 2);
    assertIdentical(
      simulation.deadLetters[0].exhaustedCondition,
      "MaximumRetryAttempts",
    );
  });

  it("waits for the maximum event age before dead-lettering", async () => {
    // Given a retry policy whose next exponential delay crosses its age limit.
    const simulation = retrySimulation();

    await createRetryingSchedule(simulation, {
      MaximumEventAgeInSeconds: 60,
      MaximumRetryAttempts: 185,
    });

    // When the clock reaches the last retry at 31 seconds, but not the age limit.
    await simulation.clock.advanceBy({ hours: 1, seconds: 59 });

    assertArrayLength([...simulation.attempts], 6);
    assertArrayEmpty([...simulation.deadLetters]);

    // When the event becomes 60 seconds old.
    await simulation.clock.advanceBy({ seconds: 1 });

    // Then no extra attempt ran and the age limit identifies the exhaustion.
    assertArrayLength(simulation.attempts, 6);
    assertArrayLength(simulation.deadLetters, 1);
    assertIdentical(
      simulation.deadLetters[0].exhaustedCondition,
      "MaximumEventAgeInSeconds",
    );
  });
});

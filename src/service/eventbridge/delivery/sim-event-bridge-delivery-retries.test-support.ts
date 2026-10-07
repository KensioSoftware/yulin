import { BackgroundTasks } from "../../../util/background/background.js";
import { SimClockControl } from "../../../util/clock/sim-clock-control.js";
import { SimControllableClock } from "../../../util/clock/sim-controllable-clock.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { SimEventBridge } from "../sim-event-bridge.js";
import type { SimEventTargetRetryPolicyInput } from "../target/sim-event-target-retry-policy.js";
import type { SimEventBridgeDeadLetterRequest } from "./sim-event-bridge-delivery.js";
import {
  SimEventBridgeFailingTargets,
  type SimEventBridgeFailingTargetsOptions,
} from "./sim-event-bridge-failing-targets.test-support.js";

const startedAt = new Date("2026-10-07T09:00:00.000Z");

export interface RetrySimulation {
  readonly eventBridge: SimEventBridge;
  readonly clock: SimClockControl;
  readonly attempts: Date[];
  readonly deadLetters: SimEventBridgeDeadLetterRequest[];
}

/**
 * A simulated EventBridge whose targets fail as the options say.
 */
export function retrySimulation(
  options: SimEventBridgeFailingTargetsOptions,
): RetrySimulation {
  const clock = new SimControllableClock({
    base: new SimFixedClock(startedAt),
  });
  const background = new BackgroundTasks({ clock });
  const targets = new SimEventBridgeFailingTargets(clock, options);

  return {
    eventBridge: new SimEventBridge({ background, deliveryTargets: targets }),
    clock: new SimClockControl({ clock, background }),
    attempts: targets.attempts,
    deadLetters: targets.deadLetters,
  };
}

/**
 * Add a rule with one target carrying the given retry policy and a
 * dead-letter queue, and put one matching event.
 */
export async function putOrder(
  simulation: RetrySimulation,
  target: {
    readonly RetryPolicy?: SimEventTargetRetryPolicyInput;
    readonly DeadLetterConfig?: { readonly Arn: string };
  },
): Promise<void> {
  const { eventBridge } = simulation;

  await eventBridge.putRule({
    input: {
      Name: "orders",
      EventPattern: JSON.stringify({ source: ["orders.service"] }),
    },
  });
  await eventBridge.putTargets({
    input: {
      Rule: "orders",
      Targets: [
        {
          Id: "fulfilment",
          Arn: "arn:aws:sqs:us-east-1:888888888888:fulfilment",
          ...target,
        },
      ],
    },
  });
  await eventBridge.putEvents({
    input: {
      Entries: [
        {
          Source: "orders.service",
          DetailType: "OrderPlaced",
          Detail: JSON.stringify({ orderId: "order-1" }),
        },
      ],
    },
  });
  await simulation.clock.advanceBy({ milliseconds: 0 });
}

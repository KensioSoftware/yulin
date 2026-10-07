import type { SimClock } from "../../../util/clock/sim-clock.js";
import type {
  SimEventBridgeDeadLetterRequest,
  SimEventBridgeDeliveryTargets,
} from "./sim-event-bridge-delivery.js";

/**
 * How a set of failing targets behaves.
 */
export interface SimEventBridgeFailingTargetsOptions {
  readonly succeedsOnAttempt?: number;
  readonly error?: Error;
  readonly deadLetterRefused?: boolean;
}

/**
 * Targets that fail with an error until a given attempt, and whose
 * dead-letter queue takes or refuses what it is sent, keeping both.
 */
export class SimEventBridgeFailingTargets implements SimEventBridgeDeliveryTargets {
  public readonly attempts: Date[] = [];
  public readonly deadLetters: SimEventBridgeDeadLetterRequest[] = [];

  constructor(
    private readonly clock: SimClock,
    private readonly options: SimEventBridgeFailingTargetsOptions,
  ) {}

  deliver(): Promise<void> {
    this.attempts.push(this.clock.now());

    if (this.attempts.length === this.options.succeedsOnAttempt) {
      return Promise.resolve();
    }

    return Promise.reject(
      this.options.error ?? new Error("fulfilment is unavailable"),
    );
  }

  deadLetter(request: SimEventBridgeDeadLetterRequest): Promise<void> {
    if (this.options.deadLetterRefused === true) {
      return Promise.reject(new Error("dead-letter queue refused"));
    }

    this.deadLetters.push(request);
    return Promise.resolve();
  }
}

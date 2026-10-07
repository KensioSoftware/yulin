import type { BackgroundScheduler } from "../../../util/background/background.js";
import {
  SimEventBridgeDeliveryNotPermitted,
  SimEventBridgeTargetNotFound,
} from "../error/sim-event-bridge-delivery.error.js";
import type {
  SimEventBridgeDeliveryRequest,
  SimEventBridgeDeliveryTargets,
  SimEventBridgeExhaustedRetryCondition,
} from "./sim-event-bridge-delivery.js";

const millisecondsPerSecond = 1000;

interface SimEventBridgeDeliveryAttemptProperties {
  readonly request: SimEventBridgeDeliveryRequest;
  readonly endpoints: SimEventBridgeDeliveryTargets;
  readonly background: BackgroundScheduler;
  readonly record: (error: unknown) => void;
}

/**
 * One event's delivery to one target, across its first attempt and any
 * retries.
 *
 * A target with a `RetryPolicy` has a failed attempt retried on the
 * simulation's clock, one second later, then two, four and so on. Retries stop
 * at the policy's retry limit, or at its event age counted from the first
 * attempt. A missing target or a refusal is never retried, because the same
 * request gets the same answer, and EventBridge sends those straight to the
 * dead-letter queue.
 *
 * An event given up on goes to the target's dead-letter queue where it names
 * one. A failure is recorded where it names none, or where the dead-letter
 * queue refuses it in turn.
 */
export class SimEventBridgeDeliveryAttempt {
  private readonly properties: SimEventBridgeDeliveryAttemptProperties;
  private readonly firstAttemptAt: Date;
  private retryAttempts = 0;

  constructor(properties: SimEventBridgeDeliveryAttemptProperties) {
    this.properties = properties;
    this.firstAttemptAt = properties.background.now();
  }

  /**
   * Make the first attempt.
   */
  async start(): Promise<void> {
    await this.attempt();
  }

  private async attempt(): Promise<void> {
    try {
      await this.properties.endpoints.deliver(this.properties.request);
    } catch (error) {
      await this.failed(error);
    }
  }

  private async failed(error: unknown): Promise<void> {
    const policy = this.properties.request.target.retryPolicy;

    if (policy === undefined || isPermanent(error)) {
      await this.abandon(error, undefined);
      return;
    }

    if (this.retryAttempts >= policy.maximumRetryAttempts) {
      await this.abandon(error, "MaximumRetryAttempts");
      return;
    }

    const retryDue = this.retryDueTime();
    const expiresAt = new Date(
      this.firstAttemptAt.getTime() +
        policy.maximumEventAgeInSeconds * millisecondsPerSecond,
    );

    if (retryDue > expiresAt) {
      this.properties.background.scheduleAt(expiresAt, async () => {
        await this.abandon(error, "MaximumEventAgeInSeconds");
      });
      return;
    }

    this.properties.background.scheduleAt(retryDue, async () => {
      this.retryAttempts += 1;
      await this.attempt();
    });
  }

  /**
   * The first retry waits one second, and every following wait doubles.
   */
  private retryDueTime(): Date {
    const delaySeconds = 2 ** this.retryAttempts;

    return new Date(
      this.properties.background.now().getTime() +
        delaySeconds * millisecondsPerSecond,
    );
  }

  private async abandon(
    error: unknown,
    exhaustedCondition: SimEventBridgeExhaustedRetryCondition | undefined,
  ): Promise<void> {
    const { request, endpoints, record } = this.properties;

    if (request.target.deadLetterConfig === undefined) {
      record(error);
      return;
    }

    try {
      await endpoints.deadLetter({
        delivery: request,
        error,
        retryAttempts: this.retryAttempts,
        exhaustedCondition,
      });
    } catch (deadLetterError) {
      record(deadLetterError);
    }
  }
}

/**
 * Whether a failure would come back the same however often it was retried.
 */
function isPermanent(error: unknown): boolean {
  return (
    error instanceof SimEventBridgeDeliveryNotPermitted ||
    error instanceof SimEventBridgeTargetNotFound
  );
}

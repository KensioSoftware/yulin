import type { BackgroundScheduler } from "../../../util/background/background.js";
import {
  SimSchedulerDeliveryNotPermitted,
  SimSchedulerTargetNotFound,
} from "../error/sim-scheduler-delivery.error.js";
import type {
  SimSchedulerDeliveryRequest,
  SimSchedulerDeliveryTargets,
  SimSchedulerExhaustedRetryCondition,
} from "./sim-scheduler-delivery.js";

const millisecondsPerSecond = 1000;

interface SimSchedulerDeliveryAttemptProperties {
  readonly request: SimSchedulerDeliveryRequest;
  readonly endpoints: SimSchedulerDeliveryTargets;
  readonly background: BackgroundScheduler;
  readonly record: (error: unknown) => void;
}

/**
 * One scheduled invocation across its initial attempt and any retries.
 */
export class SimSchedulerDeliveryAttempt {
  private readonly properties: SimSchedulerDeliveryAttemptProperties;
  private retryAttempts = 0;

  constructor(properties: SimSchedulerDeliveryAttemptProperties) {
    this.properties = properties;
  }

  /**
   * Make the initial attempt.
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
    if (this.isPermanent(error)) {
      await this.abandon(error);
      return;
    }

    const policy = this.properties.request.schedule.target.retryPolicy;
    const maximumRetries = policy?.maximumRetryAttempts ?? 0;

    if (this.retryAttempts >= maximumRetries) {
      await this.abandon(error, "MaximumRetryAttempts");
      return;
    }

    const retryDue = this.retryDueTime();
    const expiresAt =
      this.properties.request.at.getTime() +
      (policy?.maximumEventAgeInSeconds ?? 0) * millisecondsPerSecond;

    if (policy !== undefined && retryDue.getTime() > expiresAt) {
      this.properties.background.scheduleAt(new Date(expiresAt), async () => {
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

  private isPermanent(error: unknown): boolean {
    return (
      error instanceof SimSchedulerDeliveryNotPermitted ||
      error instanceof SimSchedulerTargetNotFound
    );
  }

  private async abandon(
    error: unknown,
    exhaustedCondition?: SimSchedulerExhaustedRetryCondition,
  ): Promise<void> {
    const { request, endpoints, record } = this.properties;

    if (request.schedule.target.deadLetterConfig?.arn === undefined) {
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

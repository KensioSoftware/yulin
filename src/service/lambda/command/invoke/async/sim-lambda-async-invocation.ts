import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import type { SimLambdaDestinationTargets } from "../../../destination/sim-lambda-destination-targets.js";
import {
  simLambdaEventTooOld,
  simLambdaRetryDueTime,
} from "../../../function/event-invoke/sim-lambda-event-invoke-settings.js";
import type { SimLambdaFunction } from "../../../function/sim-lambda-function.js";
import type { SimLambdaAsyncInvocationSettings } from "./sim-lambda-async-invocation-settings.js";
import {
  simLambdaAbandonedOutcome,
  SimLambdaAsyncOutcomeDelivery,
  simLambdaSuccessOutcome,
} from "./sim-lambda-async-outcome.js";

interface SimLambdaAsyncInvocationProperties {
  readonly simFunction: SimLambdaFunction;
  readonly event: unknown;
  readonly settings: SimLambdaAsyncInvocationSettings;
  readonly background: BackgroundScheduler;
  readonly destinations: SimLambdaDestinationTargets;
}

/**
 * One asynchronous invocation of a simulated Lambda function, from the first
 * attempt to wherever its result ends up.
 *
 * A handler error is kept from the caller, as real Lambda keeps it: nobody is
 * waiting on an Event invocation. Retries wait on the simulated clock, so a
 * test is in charge of when they happen.
 */
export class SimLambdaAsyncInvocation {
  private readonly properties: SimLambdaAsyncInvocationProperties;
  private readonly outcomes: SimLambdaAsyncOutcomeDelivery;
  private readonly startedAt: Date;
  private attemptCount = 0;

  constructor(properties: SimLambdaAsyncInvocationProperties) {
    this.properties = properties;
    this.startedAt = properties.background.now();
    this.outcomes = new SimLambdaAsyncOutcomeDelivery(properties);
  }

  /**
   * Accept the invocation and let it run behind the caller.
   */
  start(): void {
    this.properties.background.schedule(async () => {
      await this.attempt();
    });
  }

  private async attempt(): Promise<void> {
    const { simFunction, event } = this.properties;
    this.attemptCount += 1;

    try {
      await this.outcomes.deliver(
        simLambdaSuccessOutcome(await simFunction.invoke(event)),
        this.attemptCount,
      );
    } catch (error) {
      await this.failed(error);
    }
  }

  /**
   * Retry the attempt that threw, or give up where the last one has been
   * made.
   */
  private async failed(error: unknown): Promise<void> {
    const { background, settings } = this.properties;

    if (this.attemptCount > settings.maximumRetryAttempts) {
      await this.abandon(error, "RetriesExhausted");
      return;
    }

    background.scheduleAt(
      simLambdaRetryDueTime(background.now(), this.attemptCount),
      async () => {
        await (simLambdaEventTooOld(this.startedAt, background.now(), settings)
          ? this.abandon(error, "EventAgeExceeded")
          : this.attempt());
      },
    );
  }

  /**
   * Give up on the invocation, telling its failure destination why and
   * dead-lettering the event.
   */
  private async abandon(
    error: unknown,
    condition: "RetriesExhausted" | "EventAgeExceeded",
  ): Promise<void> {
    await this.outcomes.deliver(
      simLambdaAbandonedOutcome(error, condition),
      this.attemptCount,
    );
    await this.outcomes.deadLetter();
  }
}

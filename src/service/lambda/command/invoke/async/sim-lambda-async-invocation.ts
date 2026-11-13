import type { BackgroundScheduler } from "../../../../../util/background/background.js";
import type { SimLambdaDestinationTargets } from "../../../destination/sim-lambda-destination-targets.js";
import { simLambdaEventTooOld } from "../../../function/event-invoke/sim-lambda-event-invoke-settings.js";
import type { SimLambdaFunction } from "../../../function/sim-lambda-function.js";
import type { SimLambdaAsyncInvocationSettings } from "./sim-lambda-async-invocation-settings.js";
import {
  simLambdaAbandonedOutcome,
  SimLambdaAsyncOutcomeDelivery,
  simLambdaSuccessOutcome,
} from "./sim-lambda-async-outcome.js";
import { simLambdaHandlerAttempt } from "./sim-lambda-handler-attempt.js";
import { SimLambdaAsyncAttempts } from "./sim-lambda-async-attempts.js";
import { simAwsLineage } from "../../../../aws/lineage/sim-aws-lineage.js";

interface SimLambdaAsyncInvocationProperties {
  readonly simFunction: SimLambdaFunction;

  /** The ARN the invocation was asked for by, which the handler is told. */
  readonly invokedFunctionArn: string;
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
  private readonly attempts: SimLambdaAsyncAttempts;
  private readonly startedAt: Date;

  /**
   * The chain of requests the invocation was made in, which every attempt
   * carries on.
   */
  private readonly lineage = simAwsLineage.current();

  constructor(properties: SimLambdaAsyncInvocationProperties) {
    this.properties = properties;
    this.startedAt = properties.background.now();
    this.outcomes = new SimLambdaAsyncOutcomeDelivery(properties);
    this.attempts = new SimLambdaAsyncAttempts(properties);
  }

  /**
   * Accept the invocation and let it run behind the caller.
   */
  start(): void {
    this.properties.background.schedule(() => this.attempt());
  }

  private async attempt(): Promise<void> {
    const attempt = await simAwsLineage.passing(this.lineage, async () =>
      simLambdaHandlerAttempt(this.properties),
    );

    if (attempt.succeeded) {
      this.attempts.count += 1;
      await this.outcomes.deliver(
        simLambdaSuccessOutcome(attempt.result),
        this.attempts.count,
      );
      return;
    }

    this.retryOrAbandon(attempt.error, this.attempts.nextAfter(attempt));
  }

  /**
   * Try the invocation again when it falls due, unless the event is too old
   * by then, or give it up now. One given up goes to the failure destination
   * and dead-letter target. A stopped or unrunnable invocation has no
   * condition of its own on AWS, so it reads `RetriesExhausted` there too.
   */
  private retryOrAbandon(error: unknown, due: Date | undefined): void {
    const { background, settings } = this.properties;

    if (due === undefined) {
      background.schedule(async () => this.abandon(error, "RetriesExhausted"));
      return;
    }

    background.scheduleAt(due, () =>
      simLambdaEventTooOld(this.startedAt, background.now(), settings)
        ? this.abandon(error, "EventAgeExceeded")
        : this.attempt(),
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
      this.attempts.count,
    );
    await this.outcomes.deadLetter();
  }
}

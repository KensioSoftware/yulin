import { randomUUID } from "node:crypto";
import type { SimClock } from "../../../../../util/clock/sim-clock.js";
import { SimLambdaDestinationArn } from "../../../destination/sim-lambda-destination-arn.js";
import { functionErrorDocument } from "../invoke-payload.js";
import { makeSimLambdaDestinationRecord } from "../../../destination/sim-lambda-destination-record.js";
import type { SimLambdaDestinationTargets } from "../../../destination/sim-lambda-destination-targets.js";
import type { SimLambdaInvocationCondition } from "../../../function/event-invoke/sim-lambda-event-invoke-config.js";
import type { SimLambdaFunction } from "../../../function/sim-lambda-function.js";
import type { SimLambdaAsyncInvocationSettings } from "./sim-lambda-async-invocation-settings.js";

/**
 * How one asynchronous invocation ended.
 */
export interface SimLambdaAsyncOutcome {
  readonly condition: SimLambdaInvocationCondition;
  readonly responsePayload: unknown;
  readonly functionError?: string | undefined;

  /**
   * Whether an attempt ran to produce this. An event abandoned for age never
   * reached one, so it carries no response context.
   */
  readonly ran: boolean;
}

/**
 * The outcome of an invocation whose handler returned.
 */
export function simLambdaSuccessOutcome(
  result: unknown,
): SimLambdaAsyncOutcome {
  return {
    condition: "Success",
    responsePayload: result ?? null,
    ran: true,
  };
}

/**
 * The outcome of an invocation nobody is waiting on any more.
 *
 * An event given up on for age never reached a final attempt, so it reports no
 * error and carries no response context.
 */
export function simLambdaAbandonedOutcome(
  error: unknown,
  condition: "RetriesExhausted" | "EventAgeExceeded",
): SimLambdaAsyncOutcome {
  const ran = condition === "RetriesExhausted";

  return {
    condition,
    responsePayload: ran ? functionErrorDocument(error) : null,
    functionError: ran ? "Unhandled" : undefined,
    ran,
  };
}

interface SimLambdaAsyncOutcomeDeliveryProperties {
  readonly simFunction: SimLambdaFunction;
  readonly settings: SimLambdaAsyncInvocationSettings;
  readonly destinations: SimLambdaDestinationTargets;
  readonly background: SimClock;
  readonly event: unknown;
}

/**
 * Where one asynchronous invocation's outcome is sent.
 *
 * A destination that cannot be delivered to is left to reach whoever advanced
 * the clock, since a record that silently goes nowhere is the harder failure
 * to find.
 */
export class SimLambdaAsyncOutcomeDelivery {
  /**
   * The id every record of this invocation carries, which is the one AWS gives
   * the request rather than one per attempt.
   */
  private readonly requestId = randomUUID();

  private readonly properties: SimLambdaAsyncOutcomeDeliveryProperties;

  constructor(properties: SimLambdaAsyncOutcomeDeliveryProperties) {
    this.properties = properties;
  }

  /**
   * Send the outcome to the destination it belongs to, if there is one.
   */
  async deliver(
    outcome: SimLambdaAsyncOutcome,
    attemptCount: number,
  ): Promise<void> {
    const { simFunction, settings, destinations, event } = this.properties;
    const destination =
      outcome.condition === "Success"
        ? settings.onSuccessArn
        : settings.onFailureArn;

    if (destination === undefined) {
      return;
    }

    await destinations.deliver({
      destinationArn: SimLambdaDestinationArn.of(destination),
      sourceFunctionArn: simFunction.arn,
      sourceFunctionRoleArn: simFunction.roleArn,
      record: makeSimLambdaDestinationRecord({
        requestId: this.requestId,
        functionArn: simFunction.arn,
        executedVersion: simFunction.version,
        approximateInvokeCount: attemptCount,
        requestPayload: event,
        timestamp: this.properties.background.now(),
        ...outcome,
      }),
    });
  }

  /**
   * Send the invoked event to the function's dead-letter target, if it has
   * one.
   */
  async deadLetter(): Promise<void> {
    const { simFunction, settings, destinations, event } = this.properties;

    if (settings.deadLetterArn === undefined) {
      return;
    }

    await destinations.deadLetter({
      targetArn: SimLambdaDestinationArn.of(settings.deadLetterArn),
      payload: event,
      sourceFunctionArn: simFunction.arn,
      sourceFunctionRoleArn: simFunction.roleArn,
    });
  }
}

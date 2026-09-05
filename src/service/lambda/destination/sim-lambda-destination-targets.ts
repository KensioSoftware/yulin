import type { SimLambdaStreamFailureRecord } from "../event-source/poll/sim-lambda-stream-failure-record.js";
import { SimLambdaError } from "../error/sim-lambda.error.js";
import type { SimLambdaDestinationArn } from "./sim-lambda-destination-arn.js";
import type { SimLambdaDestinationRecord } from "./sim-lambda-destination-record.js";

/**
 * One asynchronous invocation result on its way to one destination.
 */
export interface SimLambdaDestinationDeliveryRequest {
  readonly destinationArn: SimLambdaDestinationArn;
  readonly record: SimLambdaDestinationRecord | SimLambdaStreamFailureRecord;

  /**
   * The function whose invocation produced this record, which is what the
   * delivery is attributed to.
   */
  readonly sourceFunctionArn: string;

  /** The execution Role Lambda uses to deliver this record. */
  readonly sourceFunctionRoleArn: string;
}

/**
 * One asynchronous invocation's event on its way to a dead-letter target.
 *
 * A dead-letter target receives the event as it was invoked. The destination
 * record's envelope belongs to the newer mechanism, and real Lambda leaves it
 * off here.
 */
export interface SimLambdaDeadLetterRequest {
  readonly targetArn: SimLambdaDestinationArn;
  readonly payload: unknown;
  readonly sourceFunctionArn: string;
  readonly sourceFunctionRoleArn: string;
}

/**
 * Everywhere a simulated function's asynchronous invocation results can go.
 */
export interface SimLambdaDestinationTargets {
  deliver(request: SimLambdaDestinationDeliveryRequest): Promise<void>;
  deadLetter(request: SimLambdaDeadLetterRequest): Promise<void>;
}

/**
 * Destinations used when no wider simulation is wired up, such as for a
 * standalone SimLambda constructed outside SimAws.
 */
export class SimLambdaNoDestinationTargets implements SimLambdaDestinationTargets {
  /**
   * Say that this SimLambda has nowhere to send an invocation result.
   */
  deliver(request: SimLambdaDestinationDeliveryRequest): Promise<never> {
    throw this.unreachable(request.destinationArn);
  }

  /**
   * Say that this SimLambda has nowhere to dead-letter an event.
   */
  deadLetter(request: SimLambdaDeadLetterRequest): Promise<never> {
    throw this.unreachable(request.targetArn);
  }

  private unreachable(arn: SimLambdaDestinationArn): Error {
    return new SimLambdaError(
      `Cannot deliver to ${arn.value}: this SimLambda has no wider ` +
        "simulation to send an invocation result to. Create the function " +
        "through SimAws, or construct SimLambda with destinations.",
    );
  }
}

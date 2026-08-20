import { SimLambdaDestinationArn } from "../../destination/sim-lambda-destination-arn.js";
import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import {
  MAX_SIM_LAMBDA_MAXIMUM_EVENT_AGE_SECONDS,
  MAX_SIM_LAMBDA_MAXIMUM_RETRY_ATTEMPTS,
  MIN_SIM_LAMBDA_MAXIMUM_EVENT_AGE_SECONDS,
  type SimLambdaDestination,
  type SimLambdaDestinationConfiguration,
  type SimLambdaEventInvokeConfigUpdate,
} from "../../function/event-invoke/sim-lambda-event-invoke-config.js";

/**
 * What both commands that write an event invoke config carry.
 */
export interface SimLambdaEventInvokeConfigInput {
  readonly MaximumRetryAttempts?: number | undefined;
  readonly MaximumEventAgeInSeconds?: number | undefined;
  readonly DestinationConfig?: SimLambdaDestinationConfiguration | undefined;
}

/**
 * Reads the settings of an event invoke config request.
 *
 * A destination is read here so an ARN naming something the simulation cannot
 * send to is refused while the caller is still there to see it, rather than
 * when an invocation first fails hours later.
 */
export class EventInvokeConfigInputParser {
  /**
   * Read a request's settings, refusing values real Lambda refuses.
   */
  parse(
    input: SimLambdaEventInvokeConfigInput,
  ): SimLambdaEventInvokeConfigUpdate {
    return {
      maximumRetryAttempts: this.retryAttempts(input.MaximumRetryAttempts),
      maximumEventAgeInSeconds: this.eventAge(input.MaximumEventAgeInSeconds),
      onSuccessArn: this.destination(input.DestinationConfig?.OnSuccess),
      onFailureArn: this.destination(input.DestinationConfig?.OnFailure),
    };
  }

  private retryAttempts(value: number | undefined): number | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > MAX_SIM_LAMBDA_MAXIMUM_RETRY_ATTEMPTS
    ) {
      throw new SimLambdaInvalidParameterValueException(
        `MaximumRetryAttempts must be a whole number between 0 and ` +
          `${MAX_SIM_LAMBDA_MAXIMUM_RETRY_ATTEMPTS}, and ${value} is not.`,
      );
    }

    return value;
  }

  private eventAge(value: number | undefined): number | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (
      !Number.isSafeInteger(value) ||
      value < MIN_SIM_LAMBDA_MAXIMUM_EVENT_AGE_SECONDS ||
      value > MAX_SIM_LAMBDA_MAXIMUM_EVENT_AGE_SECONDS
    ) {
      throw new SimLambdaInvalidParameterValueException(
        "MaximumEventAgeInSeconds must be a whole number between " +
          `${MIN_SIM_LAMBDA_MAXIMUM_EVENT_AGE_SECONDS} and ` +
          `${MAX_SIM_LAMBDA_MAXIMUM_EVENT_AGE_SECONDS}, and ${value} is not.`,
      );
    }

    return value;
  }

  /**
   * The destination a request named, if it named one.
   *
   * A member sent with nothing in it is how AWS takes a destination away, and
   * reads here as no destination at all.
   */
  private destination(
    destination: SimLambdaDestination | undefined,
  ): string | undefined {
    const arn = destination?.Destination;

    if (arn === undefined || arn === "") {
      return undefined;
    }

    return SimLambdaDestinationArn.of(arn).value;
  }
}

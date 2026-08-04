import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";

/**
 * Where on a stream a mapping starts reading.
 *
 * `AT_TIMESTAMP` is the third position real Lambda takes, and it is for a
 * Kinesis stream rather than a DynamoDB one, so it is refused by name rather
 * than left out of this type quietly.
 */
export type SimLambdaEventSourceStartingPosition = "TRIM_HORIZON" | "LATEST";

/**
 * The parts of a request that say where a mapping starts reading.
 *
 * Taken as its own small input rather than as the whole command input, so the
 * rules stay with the event source they belong to rather than importing the
 * command they are read from.
 */
export interface SimLambdaEventSourceStartingPositionInput {
  readonly startingPosition?: string | undefined;
  readonly startingPositionTimestamp?: Date | undefined;
}

/**
 * Whether the event source a mapping names has a starting position, and which
 * ones it takes.
 *
 * A queue has none: a mapping on one always delivers from the front of the
 * queue, and real Lambda refuses a request that names a position for it. A
 * stream has to be given one, because there is no sensible default between
 * replaying everything the stream still holds and taking only what happens
 * next.
 */
export interface SimLambdaEventSourceStartingPositionRules {
  /**
   * The position a mapping on this source starts from, refusing a request that
   * asks for one this source does not have.
   */
  positionIn(
    input: SimLambdaEventSourceStartingPositionInput,
  ): SimLambdaEventSourceStartingPosition | undefined;
}

/**
 * The rules for an event source with no starting position.
 */
export class SimLambdaNoStartingPosition implements SimLambdaEventSourceStartingPositionRules {
  private readonly sourceDescription: string;

  constructor(sourceDescription: string) {
    this.sourceDescription = sourceDescription;
  }

  /**
   * Refuse a starting position, since this source has nowhere else to start.
   */
  positionIn(
    input: SimLambdaEventSourceStartingPositionInput,
  ): SimLambdaEventSourceStartingPosition | undefined {
    if (
      input.startingPosition === undefined &&
      input.startingPositionTimestamp === undefined
    ) {
      return undefined;
    }

    throw new SimLambdaInvalidParameterValueException(
      `StartingPosition is not valid for ${this.sourceDescription}: a mapping ` +
        "on one always starts from the front",
    );
  }
}

/**
 * The rules for a DynamoDB stream, which takes one of two positions.
 */
export class SimLambdaStreamStartingPosition implements SimLambdaEventSourceStartingPositionRules {
  /**
   * The position a mapping on a stream starts from.
   *
   * `StartingPositionTimestamp` only goes with `AT_TIMESTAMP`, so it is refused
   * along with it rather than being accepted and ignored.
   */
  positionIn(
    input: SimLambdaEventSourceStartingPositionInput,
  ): SimLambdaEventSourceStartingPosition {
    const requested = input.startingPosition;

    if (requested === undefined) {
      throw new SimLambdaInvalidParameterValueException(
        "StartingPosition is required for a DynamoDB stream event source " +
          "mapping. TRIM_HORIZON reads what the stream still holds, LATEST " +
          "reads only what the table changes from now on",
      );
    }

    if (requested !== "TRIM_HORIZON" && requested !== "LATEST") {
      throw new SimLambdaInvalidParameterValueException(
        `StartingPosition ${requested} is not valid for a DynamoDB stream: ` +
          "TRIM_HORIZON and LATEST are the two a DynamoDB stream takes, and " +
          "AT_TIMESTAMP is for a Kinesis stream",
      );
    }

    if (input.startingPositionTimestamp !== undefined) {
      throw new SimLambdaInvalidParameterValueException(
        "StartingPositionTimestamp only goes with the StartingPosition " +
          "AT_TIMESTAMP, which is for a Kinesis stream",
      );
    }

    return requested;
  }
}

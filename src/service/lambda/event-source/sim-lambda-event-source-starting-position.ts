import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";

/**
 * Where on a stream a mapping starts reading.
 *
 * `AT_TIMESTAMP` is the third position real Lambda takes, and it is for a
 * Kinesis stream rather than a DynamoDB one.
 */
export type SimLambdaEventSourceStartingPosition =
  | "TRIM_HORIZON"
  | "LATEST"
  | "AT_TIMESTAMP";

/**
 * Where a mapping starts reading, and when, for the position that needs an
 * instant.
 *
 * The two travel together because `AT_TIMESTAMP` means nothing without the
 * instant, and every other position means nothing with one.
 */
export interface SimLambdaEventSourceStart {
  readonly position: SimLambdaEventSourceStartingPosition;
  readonly timestamp?: Date | undefined;
}

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
   * Where a mapping on this source starts, refusing a request that asks for a
   * position this source does not have.
   */
  startIn(
    input: SimLambdaEventSourceStartingPositionInput,
  ): SimLambdaEventSourceStart | undefined;
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
  startIn(
    input: SimLambdaEventSourceStartingPositionInput,
  ): SimLambdaEventSourceStart | undefined {
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

interface SimLambdaStreamStartingPositionProperties {
  /**
   * The positions this stream takes, which is the pair every stream takes plus
   * `AT_TIMESTAMP` for the streams that have it.
   */
  readonly positions: readonly SimLambdaEventSourceStartingPosition[];
  readonly sourceDescription: string;

  /**
   * Where a position this stream lacks does belong, for a refusal to say so.
   *
   * `AT_TIMESTAMP` is a real Lambda starting position that a DynamoDB stream
   * does not take, and a caller that names it has picked the wrong source
   * rather than made something up.
   */
  readonly positionElsewhere?: string | undefined;
}

/**
 * The rules for a stream, which has to be told where to start.
 */
export class SimLambdaStreamStartingPosition implements SimLambdaEventSourceStartingPositionRules {
  private readonly positions: readonly SimLambdaEventSourceStartingPosition[];
  private readonly sourceDescription: string;
  private readonly positionElsewhere: string | undefined;

  constructor(properties: SimLambdaStreamStartingPositionProperties) {
    this.positions = properties.positions;
    this.sourceDescription = properties.sourceDescription;
    this.positionElsewhere = properties.positionElsewhere;
  }

  /**
   * Where a mapping on this stream starts.
   *
   * `StartingPositionTimestamp` only goes with `AT_TIMESTAMP`, so it is refused
   * alongside any other position rather than being accepted and ignored.
   */
  startIn(
    input: SimLambdaEventSourceStartingPositionInput,
  ): SimLambdaEventSourceStart {
    const position = this.readPosition(input.startingPosition);
    const timestamp = input.startingPositionTimestamp;

    if (position === "AT_TIMESTAMP") {
      return { position, timestamp: this.requiredTimestamp(timestamp) };
    }

    if (timestamp !== undefined) {
      throw new SimLambdaInvalidParameterValueException(
        "StartingPositionTimestamp only goes with the StartingPosition " +
          "AT_TIMESTAMP",
      );
    }

    return { position };
  }

  private readPosition(
    requested: string | undefined,
  ): SimLambdaEventSourceStartingPosition {
    if (requested === undefined) {
      throw new SimLambdaInvalidParameterValueException(
        `StartingPosition is required for ${this.sourceDescription} event ` +
          "source mapping. TRIM_HORIZON reads what the stream still holds, " +
          "LATEST reads only what arrives from now on",
      );
    }

    const found = this.positions.find((position) => position === requested);

    if (found === undefined) {
      const elsewhere = this.positionElsewhere;

      throw new SimLambdaInvalidParameterValueException(
        `StartingPosition ${requested} is not valid for ${this.sourceDescription}: ${this.positions.join(" and ")} are the ones it takes${
          elsewhere === undefined ? "" : `, and ${elsewhere}`
        }`,
      );
    }

    return found;
  }

  private requiredTimestamp(timestamp: Date | undefined): Date {
    if (timestamp === undefined || Number.isNaN(timestamp.getTime())) {
      throw new SimLambdaInvalidParameterValueException(
        "StartingPosition AT_TIMESTAMP requires a StartingPositionTimestamp " +
          "that is a date",
      );
    }

    return timestamp;
  }
}

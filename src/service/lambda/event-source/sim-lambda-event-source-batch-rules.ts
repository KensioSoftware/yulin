import {
  SimLambdaInvalidParameterValueException,
  SimLambdaValidationException,
} from "../error/sim-lambda.error.js";

interface SimLambdaEventSourceBatchRulesProperties {
  readonly defaultSize: number;
  readonly maximumSize: number;
  readonly sourceDescription: string;
  readonly unitName: string;

  /**
   * The largest batch the source delivers with no batching window, for a
   * source that needs one to fill a larger batch.
   */
  readonly largestWithoutWindow?: number | undefined;
}

/**
 * The longest batching window real Lambda accepts, five minutes.
 */
const longestWindowSeconds = 300;

/**
 * The batch sizes one kind of event source delivers with.
 *
 * The default and the maximum belong to the source rather than to the mapping:
 * how much a queue hands out in one receive is not how much another kind of
 * source would, and neither is what makes a larger request pointless. The
 * source description is the clause a refusal explains the range with, and the
 * unit name is what that source hands out: a queue has messages, a stream has
 * records.
 */
export class SimLambdaEventSourceBatchRules {
  public readonly defaultSize: number;
  public readonly maximumSize: number;

  private readonly largestWithoutWindow: number | undefined;
  private readonly sourceDescription: string;
  private readonly unitName: string;

  constructor(properties: SimLambdaEventSourceBatchRulesProperties) {
    this.defaultSize = properties.defaultSize;
    this.maximumSize = properties.maximumSize;
    this.largestWithoutWindow = properties.largestWithoutWindow;
    this.sourceDescription = properties.sourceDescription;
    this.unitName = properties.unitName;
  }

  /**
   * The batch size a mapping delivers with, refusing one this source would
   * never fill.
   */
  sizeIn(requested: number | undefined): number {
    const batchSize = requested ?? this.defaultSize;

    if (
      !Number.isSafeInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > this.maximumSize
    ) {
      throw new SimLambdaInvalidParameterValueException(
        `BatchSize ${String(batchSize)} is out of range: ` +
          `${this.sourceDescription} delivers a whole number of ` +
          `${this.unitName} between 1 and ${String(this.maximumSize)} at a ` +
          "time",
      );
    }

    return batchSize;
  }

  /**
   * The batching window a mapping waits to fill a batch for, in seconds.
   *
   * Real Lambda takes a whole number of seconds up to 300. A queue mapping
   * delivering more than ten messages at a time needs a window of at least a
   * second, and is refused without one.
   */
  windowIn(requested: number | undefined, batchSize: number): number {
    const windowSeconds = requested ?? 0;

    if (
      !Number.isSafeInteger(windowSeconds) ||
      windowSeconds < 0 ||
      windowSeconds > longestWindowSeconds
    ) {
      throw new SimLambdaValidationException(
        `1 validation error detected: Value '${String(windowSeconds)}' at ` +
          "'maximumBatchingWindowInSeconds' failed to satisfy constraint: " +
          "Member must have value less than or equal to 300",
      );
    }

    const largest = this.largestWithoutWindow;

    if (largest !== undefined && windowSeconds === 0 && batchSize > largest) {
      throw new SimLambdaInvalidParameterValueException(
        "Maximum batch window in seconds must be greater than 0 if maximum " +
          `batch size is greater than ${String(largest)}`,
      );
    }

    return windowSeconds;
  }
}

import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";

interface SimLambdaEventSourceBatchRulesProperties {
  readonly defaultSize: number;
  readonly maximumSize: number;
  readonly sourceDescription: string;
  readonly unitName: string;
}

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

  private readonly sourceDescription: string;
  private readonly unitName: string;

  constructor(properties: SimLambdaEventSourceBatchRulesProperties) {
    this.defaultSize = properties.defaultSize;
    this.maximumSize = properties.maximumSize;
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
}

import { SimLambdaInvalidParameterValueException } from "../error/sim-lambda.error.js";
import {
  type SimLambdaEventSourceRetryLimitsInput,
  SimLambdaStreamRetryLimits,
} from "./sim-lambda-stream-retry-limits.js";

/**
 * Whether the event source a mapping names has failed-batch limits at all.
 *
 * A stream does: a record stays on the stream whatever the function makes of
 * it, so the mapping is the only thing that decides when to stop trying. A
 * queue does not, because a message the function never handles goes to the
 * queue's own redrive policy, and real Lambda refuses a request that names
 * either limit for one.
 */
export interface SimLambdaEventSourceRetryLimitRules {
  /**
   * The limits a mapping on this source keeps, or nothing for a source that has
   * none, refusing a request that asks for limits this source does not have.
   */
  limitsIn(
    input: SimLambdaEventSourceRetryLimitsInput,
  ): SimLambdaStreamRetryLimits | undefined;
}

/**
 * The rules for an event source that decides for itself when to give up.
 */
export class SimLambdaNoRetryLimits implements SimLambdaEventSourceRetryLimitRules {
  private readonly sourceDescription: string;
  private readonly insteadDescription: string;

  constructor(sourceDescription: string, insteadDescription: string) {
    this.sourceDescription = sourceDescription;
    this.insteadDescription = insteadDescription;
  }

  /**
   * Refuse both limits, since this source is not the one counting.
   */
  limitsIn(
    input: SimLambdaEventSourceRetryLimitsInput,
  ): SimLambdaStreamRetryLimits | undefined {
    const named = namedLimit(input);

    if (named === undefined) {
      return undefined;
    }

    throw new SimLambdaInvalidParameterValueException(
      `${named} is not valid for ${this.sourceDescription}: ${
        this.insteadDescription
      }`,
    );
  }
}

/**
 * The rules for a stream, which counts a failed batch's attempts itself.
 */
export class SimLambdaStreamRetryLimitRules implements SimLambdaEventSourceRetryLimitRules {
  /**
   * The limits a mapping on this stream keeps, which are Lambda's own defaults
   * of no limit when the request named neither.
   */
  limitsIn(
    input: SimLambdaEventSourceRetryLimitsInput,
  ): SimLambdaStreamRetryLimits {
    return new SimLambdaStreamRetryLimits(input);
  }
}

/**
 * Which limit a request named, for a refusal to name it back.
 */
function namedLimit(
  input: SimLambdaEventSourceRetryLimitsInput,
): string | undefined {
  if (input.maximumRetryAttempts !== undefined) {
    return "MaximumRetryAttempts";
  }

  return input.maximumRecordAgeInSeconds === undefined
    ? undefined
    : "MaximumRecordAgeInSeconds";
}

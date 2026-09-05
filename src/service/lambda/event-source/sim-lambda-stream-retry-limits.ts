import { SimLambdaValidationException } from "../error/sim-lambda.error.js";

/**
 * The value both settings take to mean no limit, and what a mapping that named
 * neither of them reports.
 */
const infinite = -1;

/**
 * The largest number of retries Lambda takes.
 */
const maximumRetryAttemptsLimit = 10_000;

/**
 * The oldest record age Lambda takes, which is seven days.
 */
const maximumRecordAgeLimit = 604_800;

/**
 * How many times a failed batch is delivered again when the mapping asked for
 * no limit of its own.
 *
 * A batch a handler always throws on has to stop somewhere. AWS keeps retrying
 * until the records age out of the stream, a day later, and waiting out a
 * simulated day is a hang with more steps.
 */
const defaultAttemptLimit = 5;

const millisecondsPerSecond = 1000;

/**
 * The parts of a request that say how long a failed batch keeps being
 * delivered.
 *
 * Taken as its own small input rather than as the whole command input, so the
 * rules stay with the event source they belong to rather than importing the
 * command they are read from.
 */
export interface SimLambdaEventSourceRetryLimitsInput {
  readonly maximumRetryAttempts?: number | undefined;
  readonly maximumRecordAgeInSeconds?: number | undefined;
  readonly bisectBatchOnFunctionError?: boolean | undefined;
}

/**
 * The failed-batch limits a mapping reports back, as Lambda names them.
 */
export interface SimLambdaStreamRetryLimitsConfiguration {
  readonly MaximumRetryAttempts: number;
  readonly MaximumRecordAgeInSeconds: number;
  readonly BisectBatchOnFunctionError: boolean;
}

/**
 * What a stream mapping does with a batch its function keeps failing.
 *
 * The three settings are one thing rather than three, because they run the same
 * lifecycle. A failing batch is split around the record that broke it where the
 * mapping was asked to bisect, and a record leaves the mapping when it has had
 * its retries or when it is too old to be worth another, whichever comes first.
 * The limits are held as Lambda states them, with `-1` for no limit, so a Get
 * or a List reports back exactly what was asked for.
 */
export class SimLambdaStreamRetryLimits {
  public readonly maximumRetryAttempts: number;
  public readonly maximumRecordAgeInSeconds: number;

  /**
   * Whether a batch the function threw on is split in half and delivered again
   * as two batches.
   */
  public readonly bisectBatchOnFunctionError: boolean;

  constructor(input: SimLambdaEventSourceRetryLimitsInput = {}) {
    this.maximumRetryAttempts = checkedLimit({
      value: input.maximumRetryAttempts,
      field: "maximumRetryAttempts",
      maximum: maximumRetryAttemptsLimit,
      unit: "retries",
    });
    this.maximumRecordAgeInSeconds = checkedLimit({
      value: input.maximumRecordAgeInSeconds,
      field: "maximumRecordAgeInSeconds",
      maximum: maximumRecordAgeLimit,
      unit: "seconds",
    });
    this.bisectBatchOnFunctionError = input.bisectBatchOnFunctionError ?? false;
  }

  /**
   * The three settings as a Get, a List or a create response reports them.
   */
  configuration(): SimLambdaStreamRetryLimitsConfiguration {
    return {
      MaximumRetryAttempts: this.maximumRetryAttempts,
      MaximumRecordAgeInSeconds: this.maximumRecordAgeInSeconds,
      BisectBatchOnFunctionError: this.bisectBatchOnFunctionError,
    };
  }

  /**
   * How many times a failed batch is delivered again before it is discarded.
   *
   * A mapping that named neither limit gets the simulator's own cap of five,
   * which is what keeps a handler that always throws from leaving the clock
   * with work falling due forever. A mapping that named a record age has an end
   * of its own, so the cap is out of the way and the records age out as they do
   * on AWS.
   */
  get attemptLimit(): number {
    if (this.maximumRetryAttempts !== infinite) {
      return this.maximumRetryAttempts;
    }

    return this.maximumRecordAgeInSeconds === infinite
      ? defaultAttemptLimit
      : Infinity;
  }

  /**
   * Whether a record written at an instant is too old to be handed over again.
   *
   * A record the stream gave up without a time has no age to read, and is
   * discarded alongside the ones that aged out rather than kept forever against
   * a limit that is about age. Both simulated stream services stamp every
   * record, so this is a guard rather than a case a test can reach.
   */
  hasAgedOut(writtenAt: Date | undefined, now: Date): boolean {
    if (this.maximumRecordAgeInSeconds === infinite) {
      return false;
    }

    if (writtenAt === undefined) {
      return true;
    }

    const age = now.getTime() - writtenAt.getTime();

    return age > this.maximumRecordAgeInSeconds * millisecondsPerSecond;
  }
}

interface CheckedLimitProperties {
  readonly value: number | undefined;
  readonly field: string;
  readonly maximum: number;
  readonly unit: string;
}

/**
 * One limit as Lambda takes it, refusing a value outside the range it documents.
 */
function checkedLimit(properties: CheckedLimitProperties): number {
  const { value, field, maximum, unit } = properties;

  if (value === undefined) {
    return infinite;
  }

  if (!Number.isSafeInteger(value) || value < infinite || value > maximum) {
    throw new SimLambdaValidationException(
      `1 validation error detected: Value ${String(value)} at '${field}' ` +
        "failed to satisfy constraint: Member must be a whole number of " +
        `${unit} between 0 and ${String(maximum)}, or -1 for no limit`,
    );
  }

  return value;
}

import { SimKinesisInvalidArgumentException } from "../error/sim-kinesis.error.js";

/**
 * How long a stream keeps a record when nothing says otherwise.
 */
export const simKinesisDefaultRetentionHours = 24;

/**
 * The shortest retention real Kinesis accepts.
 */
export const simKinesisMinimumRetentionHours = 24;

/**
 * The longest retention real Kinesis accepts, which is 365 days.
 */
export const simKinesisMaximumRetentionHours = 8760;

/**
 * Read the retention a request asked for, refusing one outside the range real
 * Kinesis accepts.
 */
export function simKinesisRetentionHours(hours: number): number {
  if (
    !Number.isSafeInteger(hours) ||
    hours < simKinesisMinimumRetentionHours ||
    hours > simKinesisMaximumRetentionHours
  ) {
    throw new SimKinesisInvalidArgumentException(
      `RetentionPeriodHours ${hours} is outside the ` +
        `${simKinesisMinimumRetentionHours} to ` +
        `${simKinesisMaximumRetentionHours} hours Kinesis accepts`,
    );
  }

  return hours;
}

const millisecondsPerHour = 60 * 60 * 1000;

/**
 * The instant a stream's records have to be newer than to still be readable.
 *
 * Trimming is applied when a stream is read rather than scheduled, because it
 * is a pure function of the current time. Whatever a read finds is what the
 * retention window holds at the instant of that read, and nothing has to have
 * run in between for that to be true.
 */
export function simKinesisTrimPoint(now: Date, retentionHours: number): Date {
  return new Date(now.getTime() - retentionHours * millisecondsPerHour);
}

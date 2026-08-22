/**
 * How long a stream keeps a record when nothing says otherwise.
 *
 * Real Kinesis retains for 24 hours until IncreaseStreamRetentionPeriod or
 * DecreaseStreamRetentionPeriod moves it, and neither of those is simulated, so
 * every stream here retains for this long.
 */
export const simKinesisDefaultRetentionHours = 24;

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

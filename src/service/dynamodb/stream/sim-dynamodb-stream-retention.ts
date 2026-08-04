/**
 * How long DynamoDB Streams keeps a record before trimming it.
 */
const retentionHours = 24;

const millisecondsPerHour = 60 * 60 * 1000;

/**
 * The instant a stream's records have to be newer than to still be readable.
 *
 * Trimming is applied when a stream is read rather than scheduled, because it
 * is a pure function of the current time: whatever a read finds is what the
 * retention window holds at the instant of that read, and nothing has to have
 * run in between for that to be true. Compare `SimSqsQueue.applyLifecycle`,
 * which is the same shape for the same reason.
 *
 * A stream itself is not dropped once everything on it has been trimmed. Real
 * DynamoDB eventually stops listing a disabled stream whose records have all
 * aged out, which is a divergence in a test's favour: the ARN a test is holding
 * goes on resolving, and reading it gives an empty result rather than a
 * resource that has silently disappeared.
 */
export function simDynamoDbStreamTrimPoint(now: Date): Date {
  return new Date(now.getTime() - retentionHours * millisecondsPerHour);
}

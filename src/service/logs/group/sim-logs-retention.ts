import { SimLogsInvalidParameterException } from "../error/sim-logs.error.js";

/**
 * The retention periods real CloudWatch Logs accepts, in days.
 *
 * It is a fixed set rather than a range, which is the part teams get wrong:
 * `RetentionInDays: 10` looks reasonable and is refused. A simulator that took
 * any number would let that mistake through to the account.
 */
export const simLogsRetentionDays: readonly number[] = [
  1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827,
  2192, 2557, 2922, 3288, 3653,
];

/**
 * Read a retention period, refusing one real CloudWatch Logs would refuse.
 *
 * A log group with no retention set keeps its events forever, which is the
 * default and the reason retention is worth asserting on at all.
 */
export function requiredSimLogsRetentionDays(retentionInDays?: number): number {
  if (
    retentionInDays === undefined ||
    !simLogsRetentionDays.includes(retentionInDays)
  ) {
    throw new SimLogsInvalidParameterException(
      `1 validation error detected: Value '${String(retentionInDays)}' at ` +
        `'retentionInDays' failed to satisfy constraint: Member must be one ` +
        `of ${simLogsRetentionDays.join(", ")}`,
    );
  }

  return retentionInDays;
}

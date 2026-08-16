import { SimLogsInvalidParameterException } from "../error/sim-logs.error.js";

/**
 * Read the page size a request asked for, refusing one the operation does not
 * offer.
 *
 * Every paged CloudWatch Logs operation here has the same shape of limit and
 * differs only in how large it may be, so the maximum is passed in and the
 * check is written once.
 */
export function requiredSimLogsLimit(
  requested: number | undefined,
  maximumLimit: number,
): number {
  const limit = requested ?? maximumLimit;

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximumLimit) {
    throw new SimLogsInvalidParameterException(
      `1 validation error detected: Value '${String(requested)}' at 'limit' ` +
        `failed to satisfy constraint: Member must be between 1 and ` +
        `${maximumLimit}`,
    );
  }

  return limit;
}

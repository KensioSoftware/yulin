import { SimSesBadRequestException } from "../error/sim-ses.error.js";

/**
 * Why an address is on a suppression list.
 *
 * Real SES has these two and no more. A hard bounce and a complaint are the
 * only things that put an address on the list without someone asking for it.
 */
export type SimSesSuppressionReason = "BOUNCE" | "COMPLAINT";

const reasons = new Set<string>(["BOUNCE", "COMPLAINT"]);

/**
 * Read the reason a request carries, refusing one real SES has no name for.
 */
export function requiredSimSesSuppressionReason(
  reason: string | undefined,
): SimSesSuppressionReason {
  if (reason === undefined || !reasons.has(reason)) {
    throw new SimSesBadRequestException(
      `1 validation error detected: Value '${String(reason)}' at 'reason' ` +
        `failed to satisfy constraint: Member must satisfy enum value set: ` +
        `[${[...reasons].join(", ")}]`,
    );
  }

  return reason as SimSesSuppressionReason;
}

/**
 * Read the reasons an account is suppressing for.
 *
 * An empty list is what turns the list off, so it is accepted rather than
 * refused: `PutAccountSuppressionAttributes` with nothing in it is how the
 * console's Enabled box is unchecked.
 */
export function requiredSimSesSuppressionReasons(
  suppressedReasons: readonly string[] | undefined,
): readonly SimSesSuppressionReason[] {
  return (suppressedReasons ?? []).map((reason) =>
    requiredSimSesSuppressionReason(reason),
  );
}

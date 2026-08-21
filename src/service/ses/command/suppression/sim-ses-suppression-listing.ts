import type { SimSesSuppressedDestination } from "../../suppression/sim-ses-suppressed-destination.js";
import { requiredSimSesSuppressionReason } from "../../suppression/sim-ses-suppression-reason.js";
import type {
  SimListSuppressedDestinationsCommandInput,
  SimSesSuppressedDestinationDetail,
} from "./suppression.command.js";

/**
 * The addresses a listing request asked for, before paging.
 *
 * `StartDate` and `EndDate` are read as the API describes them, after and
 * before the time an address was last put on the list. Both are inclusive,
 * which matters to a caller reading a day at a time.
 */
export function selectedSimSesSuppressed(
  suppressed: readonly SimSesSuppressedDestination[],
  input: SimListSuppressedDestinationsCommandInput,
): readonly SimSesSuppressedDestination[] {
  const reasons = input.Reasons?.map((reason) =>
    requiredSimSesSuppressionReason(reason),
  );

  return suppressed.filter(
    (destination) =>
      (reasons === undefined || reasons.includes(destination.reason)) &&
      withinWindow(destination.lastUpdateTime, input),
  );
}

/**
 * What the suppression commands report about one address.
 */
export function simSesSuppressedDetail(
  suppressed: SimSesSuppressedDestination,
): SimSesSuppressedDestinationDetail {
  return {
    EmailAddress: suppressed.emailAddress,
    Reason: suppressed.reason,
    LastUpdateTime: suppressed.lastUpdateTime,
  };
}

function withinWindow(
  lastUpdateTime: Date,
  input: SimListSuppressedDestinationsCommandInput,
): boolean {
  const updatedAt = lastUpdateTime.getTime();

  return (
    (input.StartDate === undefined || updatedAt >= input.StartDate.getTime()) &&
    (input.EndDate === undefined || updatedAt <= input.EndDate.getTime())
  );
}

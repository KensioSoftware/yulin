import {
  SimLambdaInvalidParameterValueException,
  SimLambdaValidationException,
} from "../error/sim-lambda.error.js";

/**
 * How one Lambda listing pages.
 *
 * `maximumMaxItems` is the largest `MaxItems` the request may name, and
 * `pageLimit` is the most one answer carries whatever it names, which is how
 * ListFunctions answers with 50 functions to a request for 1,000.
 */
export interface SimLambdaPageRules {
  readonly maximumMaxItems: number;
  readonly pageLimit: number;
}

interface SimLambdaPageRequest {
  readonly Marker?: string | undefined;
  readonly MaxItems?: number | undefined;
}

/**
 * One page of a Lambda listing, and the marker that reaches the next one.
 */
export interface SimLambdaPage<T> {
  readonly items: T[];
  readonly nextMarker: string | undefined;
}

/**
 * Page a listing by the `Marker` and `MaxItems` a request carries.
 *
 * The marker is an offset into what the request selected, so it is only
 * meaningful against the same selection. A marker this simulation did not
 * issue is refused rather than quietly starting again from the beginning.
 */
export function simLambdaPage<T>(
  listed: readonly T[],
  request: SimLambdaPageRequest,
  rules: SimLambdaPageRules,
): SimLambdaPage<T> {
  const size = Math.min(
    maxItemsIn(request.MaxItems, rules.maximumMaxItems),
    rules.pageLimit,
  );
  const startIndex = startIndexIn(request.Marker, listed.length);
  const nextIndex = startIndex + size;

  return {
    items: listed.slice(startIndex, nextIndex),
    nextMarker: nextIndex >= listed.length ? undefined : String(nextIndex),
  };
}

function maxItemsIn(
  requested: number | undefined,
  maximumMaxItems: number,
): number {
  if (requested === undefined) {
    return maximumMaxItems;
  }

  if (!Number.isSafeInteger(requested) || requested < 1) {
    throw new SimLambdaValidationException(
      `1 validation error detected: Value '${String(requested)}' at ` +
        "'maxItems' failed to satisfy constraint: Member must have value " +
        "greater than or equal to 1",
    );
  }

  if (requested > maximumMaxItems) {
    throw new SimLambdaValidationException(
      `1 validation error detected: Value '${String(requested)}' at ` +
        "'maxItems' failed to satisfy constraint: Member must have value " +
        `less than or equal to ${String(maximumMaxItems)}`,
    );
  }

  return requested;
}

function startIndexIn(marker: string | undefined, listedCount: number): number {
  if (marker === undefined) {
    return 0;
  }

  const startIndex = Number(marker);

  if (
    !Number.isSafeInteger(startIndex) ||
    startIndex < 0 ||
    startIndex > listedCount ||
    String(startIndex) !== marker
  ) {
    throw new SimLambdaInvalidParameterValueException(
      `Marker ${marker} is not a marker this listing issued`,
    );
  }

  return startIndex;
}

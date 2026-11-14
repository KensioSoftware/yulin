import { SimIamInvalidMarkerException } from "../error/sim-iam.error.js";
import { assertSimIamMaxItems } from "./sim-iam-max-items.js";

/**
 * One page of an IAM listing, with the paging members IAM answers with.
 */
export interface SimIamPage<T> {
  readonly items: readonly T[];
  readonly IsTruncated: boolean;
  readonly Marker: string | undefined;
}

/**
 * The paging a listing request asks for.
 */
export interface SimIamPageInput {
  readonly Marker?: string | undefined;
  readonly MaxItems?: number | undefined;
}

/**
 * Slice one page from a listing already filtered and ordered.
 *
 * The marker is the key of the last item on the previous page, encoded so a
 * caller treats it as opaque.
 */
export function simIamPage<T>(
  items: readonly T[],
  key: (item: T) => string,
  input: SimIamPageInput,
): SimIamPage<T> {
  const maxItems = assertSimIamMaxItems(input.MaxItems);
  const start = startIndex(items, key, input.Marker);
  const page = items.slice(start, start + maxItems);
  const last = page.at(-1);
  const isTruncated = start + page.length < items.length;

  return {
    items: page,
    IsTruncated: isTruncated,
    Marker:
      isTruncated && last !== undefined
        ? Buffer.from(key(last), "utf8").toString("base64url")
        : undefined,
  };
}

function startIndex<T>(
  items: readonly T[],
  key: (item: T) => string,
  marker: string | undefined,
): number {
  if (marker === undefined) {
    return 0;
  }

  const after = Buffer.from(marker, "base64url").toString("utf8");
  const index = items.findIndex((item) => key(item) === after);

  if (index === -1) {
    throw new SimIamInvalidMarkerException("Invalid Marker");
  }

  return index + 1;
}

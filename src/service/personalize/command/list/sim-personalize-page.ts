import { SimPersonalizeInvalidInputException } from "../../error/sim-personalize.error.js";

/**
 * The default page size every Personalize list operation shares.
 */
const defaultMaxResults = 100;

const maximumMaxResults = 100;

export interface SimPersonalizePageRequest {
  readonly maxResults?: number | undefined;
  readonly nextToken?: string | undefined;
}

export interface SimPersonalizePage<T> {
  readonly items: readonly T[];
  readonly nextToken: string | undefined;
}

/**
 * Take one page of a list, and say where the next one starts.
 *
 * Real Personalize hands out an opaque token. This one is the index the next
 * page starts at, which is opaque enough for a caller that passes it straight
 * back and readable enough for anyone debugging a test.
 */
export function simPersonalizePageOf<T>(
  all: readonly T[],
  request: SimPersonalizePageRequest = {},
): SimPersonalizePage<T> {
  const maxResults = request.maxResults ?? defaultMaxResults;

  if (maxResults < 1 || maxResults > maximumMaxResults) {
    throw new SimPersonalizeInvalidInputException(
      `maxResults must be between 1 and ${maximumMaxResults}`,
    );
  }

  const start = pageStart(request.nextToken);
  const end = start + maxResults;
  const items = all.slice(start, end);

  return {
    items,
    nextToken: end < all.length ? String(end) : undefined,
  };
}

function pageStart(nextToken: string | undefined): number {
  if (nextToken === undefined) {
    return 0;
  }

  const start = Number(nextToken);

  if (!Number.isSafeInteger(start) || start < 0) {
    throw new SimPersonalizeInvalidInputException(
      `'${nextToken}' is not a Personalize pagination token`,
    );
  }

  return start;
}

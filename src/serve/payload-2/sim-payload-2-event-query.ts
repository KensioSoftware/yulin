import type { DeepPartialObject } from "@kensio/part-factory";

import type { SimPayload2Event } from "./sim-payload-2-event.type.js";

/**
 * The query of the requested URL, read from whichever of the two fields
 * carrying it a test supplied.
 *
 * An event states the query twice, raw and parsed, and either one says what
 * the request asked for. Reading it back into search parameters is what lets
 * the other one be built from it.
 */
export function simPayload2EventQuery(
  overrides: DeepPartialObject<SimPayload2Event>,
): URLSearchParams {
  if (overrides.rawQueryString !== undefined) {
    return new URLSearchParams(overrides.rawQueryString);
  }

  return new URLSearchParams(
    Object.entries(overrides.queryStringParameters ?? {}).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

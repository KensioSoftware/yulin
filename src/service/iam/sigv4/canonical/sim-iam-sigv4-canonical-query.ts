import { escapeSigV4Uri } from "../sigv4-uri-escape.js";
import { compareSigV4ByteOrder } from "./sigv4-byte-order.js";

const signatureParameter = "x-amz-signature";

/**
 * Build the canonical query string of a signed request.
 *
 * Parameters are ordered by their encoded key, and a repeated key's values are
 * ordered among themselves. Sorting whole `key=value` pairs instead would not
 * be the same thing: `-` sorts before `=`, so a key such as `a-b` would
 * overtake a shorter key `a` that it must follow.
 *
 * The raw search string is parsed here rather than being handed to
 * URLSearchParams, which applies form decoding and would read a literal `+` as
 * a space. A query string is not a form: SigV4 signs `+` as the character it
 * is, so decoding it to a space would canonicalize a different request from the
 * one the client signed.
 *
 * The signature parameter itself is left out, as it cannot be part of what it
 * signs. Header-signed requests never carry it, but presigned URLs do.
 */
export function simIamSigV4CanonicalQuery(search: string): string {
  const pairsByKey = new Map<string, string[]>();

  for (const pair of searchPairs(search)) {
    const key = decodeQueryPart(pair.key);

    if (key.toLowerCase() === signatureParameter) {
      continue;
    }

    const encodedKey = escapeSigV4Uri(key);
    const encoded = `${encodedKey}=${escapeSigV4Uri(decodeQueryPart(pair.value))}`;

    pairsByKey.set(encodedKey, [
      ...(pairsByKey.get(encodedKey) ?? []),
      encoded,
    ]);
  }

  return pairsByKey
    .keys()
    .toArray()
    .toSorted(compareSigV4ByteOrder)
    .map((encodedKey) =>
      (pairsByKey.get(encodedKey) ?? [])
        .toSorted(compareSigV4ByteOrder)
        .join("&"),
    )
    .join("&");
}

interface SearchPair {
  readonly key: string;
  readonly value: string;
}

/**
 * Split a raw search string into its key and value parts, still encoded.
 *
 * A parameter with no `=` has an empty value, which is how it is canonicalized
 * too.
 */
function searchPairs(search: string): SearchPair[] {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const pairs: SearchPair[] = [];

  for (const pair of query.split("&")) {
    if (pair.length === 0) {
      continue;
    }

    const separator = pair.indexOf("=");

    pairs.push(
      separator === -1
        ? { key: pair, value: "" }
        : { key: pair.slice(0, separator), value: pair.slice(separator + 1) },
    );
  }

  return pairs;
}

/**
 * Percent-decode one part of a query string.
 *
 * A part that is not validly encoded is used as it arrived: it cannot be
 * decoded, and the client signed those characters as they are.
 */
function decodeQueryPart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

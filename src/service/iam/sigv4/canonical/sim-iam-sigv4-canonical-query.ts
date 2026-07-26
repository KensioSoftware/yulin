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
 * The signature parameter itself is left out, as it cannot be part of what it
 * signs. Header-signed requests never carry it, but presigned URLs do.
 */
export function simIamSigV4CanonicalQuery(
  searchParameters: URLSearchParams,
): string {
  const pairsByKey = new Map<string, string[]>();

  for (const [key, value] of searchParameters) {
    if (key.toLowerCase() === signatureParameter) {
      continue;
    }

    const encodedKey = escapeSigV4Uri(key);
    const pairs = pairsByKey.get(encodedKey) ?? [];

    pairs.push(`${encodedKey}=${escapeSigV4Uri(value)}`);
    pairsByKey.set(encodedKey, pairs);
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

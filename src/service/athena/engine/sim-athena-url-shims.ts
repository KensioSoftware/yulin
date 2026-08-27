import type { DatabaseSync } from "node:sqlite";

import { shimText, simAthenaScalarShim } from "./sim-athena-shim-registry.js";
import {
  simAthenaUrlParts,
  type SimAthenaUrlParts,
} from "./sim-athena-url-parts.js";

/** What one `url_extract` function reads off a split reference. */
type SimAthenaUrlPart = (url: SimAthenaUrlParts) => string | number | null;

/** What each `url_extract` function reads off a split reference. */
const parts: ReadonlyMap<string, SimAthenaUrlPart> = new Map<
  string,
  SimAthenaUrlPart
>([
  ["url_extract_host", (url) => url.host],
  ["url_extract_path", (url) => url.path],
  ["url_extract_protocol", (url) => url.protocol],
  ["url_extract_fragment", (url) => url.fragment],
  ["url_extract_query", (url) => url.query],
  ["url_extract_port", (url) => url.port],
]);

/**
 * Trino's URL functions, which a query over access logs reaches for.
 *
 * The extract functions answer null over text that is no URI reference, and so
 * does Trino. Each one is `neverFails` there and answers null off a `URI` that
 * would not parse.
 *
 * Trino answers with an empty string for a part the URL leaves out, apart from
 * the port, which has no empty form and answers null.
 */
export function simAthenaInstallUrlShims(database: DatabaseSync): void {
  for (const [name, read] of parts) {
    simAthenaScalarShim(database, name, (value) => {
      const url = readParts(shimText(value));

      return url === undefined ? null : read(url);
    });
  }

  simAthenaScalarShim(database, "url_extract_parameter", (value, name) => {
    const wanted = shimText(name);
    const url = readParts(shimText(value));

    if (url === undefined || wanted === undefined) {
      return null;
    }

    return new URLSearchParams(url.query).get(wanted);
  });

  simAthenaScalarShim(database, "url_decode", (value) =>
    decoded(shimText(value)),
  );

  simAthenaScalarShim(database, "url_encode", (value) =>
    encoded(shimText(value)),
  );
}

/**
 * One value with its escapes read back, the way `url_decode` reads them.
 *
 * Trino runs `URLDecoder.decode` over UTF-8, which reads `+` as a space and
 * `%2B` as a plus. Replacing the plus before decoding is what keeps the two
 * apart.
 *
 * Trino raises over an escape that names no byte, and writes a replacement
 * character where the bytes it names are no UTF-8. `decodeURIComponent` throws
 * over both, and this answers null for both, the same forgiving direction the
 * rest of the file takes.
 */
function decoded(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  try {
    return decodeURIComponent(value.replaceAll("+", " "));
  } catch {
    return null;
  }
}

/**
 * One value escaped for a query string, the way `url_encode` escapes it.
 *
 * Trino runs Guava's form-parameter escaper, which keeps `-`, `_`, `.` and `*`
 * alone and writes a space as `+`. `encodeURIComponent` keeps five characters
 * beyond those four, and each of those is escaped here.
 *
 * No escape written here carries a character a later pass looks for, and a
 * space is the only character `encodeURIComponent` writes as `%20`, since a
 * percent in the value has already become `%25` by then.
 */
function encoded(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  return encodeURIComponent(value)
    .replaceAll("!", "%21")
    .replaceAll("'", "%27")
    .replaceAll("(", "%28")
    .replaceAll(")", "%29")
    .replaceAll("~", "%7E")
    .replaceAll("%20", "+");
}

/** One value split into its URL parts, or nothing where it is null or no URL. */
function readParts(value: string | undefined): SimAthenaUrlParts | undefined {
  return value === undefined ? undefined : simAthenaUrlParts(value);
}

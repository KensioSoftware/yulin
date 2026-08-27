import type { DatabaseSync } from "node:sqlite";

import { shimText, simAthenaScalarShim } from "./sim-athena-shim-registry.js";

/** What each `url_extract` function reads off a parsed URL. */
const parts: ReadonlyMap<string, (url: URL) => string | null> = new Map([
  ["url_extract_host", (url: URL) => url.hostname],
  ["url_extract_path", (url: URL) => url.pathname],
  ["url_extract_protocol", (url: URL) => url.protocol.replace(":", "")],
  ["url_extract_fragment", (url: URL) => url.hash.replace("#", "")],
  ["url_extract_query", (url: URL) => url.search.replace("?", "")],
]);

/**
 * Trino's URL functions, which a query over access logs reaches for.
 *
 * Trino fails a query over text that is no URL and the extract functions
 * answer null, the same forgiving direction the rest of the engine takes.
 *
 * Trino answers with an empty string for a part the URL leaves out, apart from
 * the port, which has no empty form and answers null.
 */
export function simAthenaInstallUrlShims(database: DatabaseSync): void {
  for (const [name, read] of parts) {
    simAthenaScalarShim(database, name, (value) => {
      const url = parsedUrl(shimText(value));

      return url === undefined ? null : read(url);
    });
  }

  simAthenaScalarShim(database, "url_extract_port", (value) =>
    writtenPort(shimText(value)),
  );

  simAthenaScalarShim(database, "url_extract_parameter", (value, name) => {
    const wanted = shimText(name);
    const url = parsedUrl(shimText(value));

    if (url === undefined || wanted === undefined) {
      return null;
    }

    return url.searchParams.get(wanted);
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
 * Trino raises over an escape it cannot read, such as `%zz`, and this answers
 * null, the same forgiving direction the rest of the file takes.
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

/** Everything between the scheme and the path, which is where a port is written. */
const authority = /^[A-Za-z][\w+.-]*:\/\/[^/?#]*/u;

/**
 * The port one URL names, or nothing where it names none.
 *
 * Read off the text rather than off the parsed URL, because the parser drops a
 * port that is the scheme's own default. Trino answers with the port a URL was
 * written with, so `http://rain.example:80/a` is eighty rather than nothing.
 */
function writtenPort(value: string | undefined): number | null {
  if (value === undefined || parsedUrl(value) === undefined) {
    return null;
  }

  const written = /:(\d+)$/u.exec(authority.exec(value)?.[0] ?? "")?.[1];

  return written === undefined ? null : Number(written);
}

function parsedUrl(value: string | undefined): URL | undefined {
  if (value === undefined) {
    return undefined;
  }

  return URL.parse(value) ?? undefined;
}

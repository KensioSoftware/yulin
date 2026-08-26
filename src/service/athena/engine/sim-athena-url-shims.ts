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
 * Trino fails a query over text that is no URL and these answer null, the same
 * forgiving direction the rest of the engine takes.
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

  simAthenaScalarShim(database, "url_extract_port", (value) => {
    const port = parsedUrl(shimText(value))?.port;

    return port === undefined || port === "" ? null : Number(port);
  });

  simAthenaScalarShim(database, "url_extract_parameter", (value, name) => {
    const wanted = shimText(name);
    const url = parsedUrl(shimText(value));

    if (url === undefined || wanted === undefined) {
      return null;
    }

    return url.searchParams.get(wanted);
  });
}

function parsedUrl(value: string | undefined): URL | undefined {
  if (value === undefined) {
    return undefined;
  }

  return URL.parse(value) ?? undefined;
}

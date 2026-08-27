/** One URI reference split the way Java's `URI` splits it. */
export interface SimAthenaUrlParts {
  readonly protocol: string;
  readonly host: string;
  readonly port: number | null;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;
}

/**
 * A URI reference, split as RFC 3986 writes the expression for it.
 *
 * This is the expression the RFC prints in its own appendix, character for
 * character. Its groups are optional and never nested, so what a reference
 * that does not match costs in backtracking is bounded by the text's length.
 */
const reference =
  // oxlint-disable-next-line security/detect-unsafe-regex
  /^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/u;

/** The characters RFC 2396 allows, which is what Java's `URI` takes. */
const disallowed = /[^A-Za-z0-9;/?:@&=+$,\-_.!~*'()%[\]#]/u;

/** A percent naming no byte, which Java's `URI` reads as malformed. */
const malformedEscape = /%(?![0-9A-Fa-f]{2})/u;

/** A scheme starts with a letter and carries no other punctuation. */
const schemeName = /^[A-Za-z][A-Za-z0-9+.-]*$/u;

const digits = /^\d+$/u;

/**
 * One URI reference split into its parts, or nothing where it is no reference.
 *
 * Trino reads a URL with `new URI(text)`, which takes a reference with no
 * scheme of its own. `/reports/august?tenant=acme` is one, and it is the shape
 * a CloudFront access log holds, since the log carries the path and the query
 * in columns of their own and no whole URL anywhere.
 *
 * The parts are read off the text rather than resolved against a base. That is
 * what `URI` does, and it keeps a relative path as the text wrote it.
 *
 * A part the reference leaves out comes back as the empty string, which is
 * what Trino answers for one. The port has no empty form and answers null.
 */
export function simAthenaUrlParts(text: string): SimAthenaUrlParts | undefined {
  if (disallowed.test(text) || malformedEscape.test(text)) {
    return undefined;
  }

  const found = reference.exec(text);

  if (found === null) {
    return undefined;
  }

  const scheme = found.at(1);

  if (scheme !== undefined && !schemeName.test(scheme)) {
    return undefined;
  }

  const authority = found.at(2);
  const path = found.at(3) ?? "";
  // A scheme followed by anything but a slash is an opaque URI, and Java reads
  // neither a path nor a query out of one. `mailto:a@b` is the case.
  const opaque =
    scheme !== undefined && authority === undefined && !path.startsWith("/");

  return {
    protocol: scheme ?? "",
    ...hostAndPort(authority),
    path: opaque ? "" : path,
    query: opaque ? "" : (found.at(4) ?? ""),
    fragment: found.at(5) ?? "",
  };
}

/**
 * The host and the port one authority names.
 *
 * The user's own credentials sit before an `@` and are no part of the host, so
 * the digits in `user:1234@rain.example` are no port. A colon with anything
 * but digits after it belongs to the host, which is what keeps the one inside
 * an IPv6 literal out of the port.
 */
function hostAndPort(authority: string | undefined): {
  readonly host: string;
  readonly port: number | null;
} {
  if (authority === undefined) {
    return { host: "", port: null };
  }

  const written = authority.slice(authority.lastIndexOf("@") + 1);
  const colon = written.lastIndexOf(":");
  const port = written.slice(colon + 1);

  if (colon === -1 || !digits.test(port)) {
    return { host: written, port: null };
  }

  return { host: written.slice(0, colon), port: Number(port) };
}

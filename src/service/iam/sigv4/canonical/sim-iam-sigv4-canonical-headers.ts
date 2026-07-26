import { SimIamSignatureDoesNotMatch } from "../error/sim-iam-sigv4.error.js";
import { compareSigV4ByteOrder } from "./sigv4-byte-order.js";

/**
 * Build the canonical headers and signed header list of a signed request.
 *
 * Only the headers the signer listed are canonicalized, whatever else the
 * request carries. Each value is trimmed and its runs of whitespace collapsed,
 * which is what makes a signature survive the whitespace normalization a proxy
 * or HTTP client is entitled to apply.
 */
export class SimIamSigV4CanonicalHeaders {
  private readonly names: readonly string[];
  private readonly lines: readonly string[];

  constructor(
    headers: Headers,
    signedHeaderNames: readonly string[],
    url: URL,
  ) {
    this.names = signedHeaderNames.toSorted(compareSigV4ByteOrder);
    this.lines = this.names.map(
      (name) => `${name}:${canonicalValue(headers, name, url)}`,
    );
  }

  /**
   * The canonical headers block, one `name:value` line per signed header.
   */
  toString(): string {
    return this.lines.join("\n");
  }

  /**
   * The signed header names, in the order they are canonicalized.
   */
  signedHeaderList(): string {
    return this.names.join(";");
  }
}

function canonicalValue(headers: Headers, name: string, url: URL): string {
  const value = headers.get(name) ?? impliedValue(name, url);

  if (value === undefined) {
    throw new SimIamSignatureDoesNotMatch(
      `Request does not carry signed header ${name}, so the signature ` +
        `cannot be reproduced`,
    );
  }

  return value.trim().replaceAll(/\s+/g, " ");
}

/**
 * Supply a signed header the request implies rather than carries.
 *
 * Host is always signed but is not always readable as a header, since some HTTP
 * clients own it. The URL the request was made to says the same thing.
 */
function impliedValue(name: string, url: URL): string | undefined {
  return name === "host" ? url.host : undefined;
}

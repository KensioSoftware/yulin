import type { SimIamSigV4SignedRequest } from "../sim-iam-sigv4-signed-request.js";
import { SimIamSigV4CanonicalHeaders } from "./sim-iam-sigv4-canonical-headers.js";
import { simIamSigV4CanonicalPath } from "./sim-iam-sigv4-canonical-path.js";
import { simIamSigV4CanonicalQuery } from "./sim-iam-sigv4-canonical-query.js";
import { simIamSigV4PayloadHash } from "./sim-iam-sigv4-payload-hash.js";

/**
 * The canonical form of a signed request: the exact bytes a signature is made
 * over.
 *
 * Rebuilding this from the request as received, and getting the same signature
 * out, is the whole of SigV4 verification. Anything the canonical form covers
 * cannot be altered in transit without detection, and anything it leaves out
 * can be.
 */
export class SimIamSigV4CanonicalRequest {
  private readonly canonicalHeaders: SimIamSigV4CanonicalHeaders;
  private readonly signedRequest: SimIamSigV4SignedRequest;

  constructor(
    signedRequest: SimIamSigV4SignedRequest,
    signedHeaderNames: readonly string[],
  ) {
    this.signedRequest = signedRequest;
    this.canonicalHeaders = new SimIamSigV4CanonicalHeaders(
      signedRequest.headers,
      signedHeaderNames,
      signedRequest.url,
    );
  }

  /**
   * The canonical request string, ready to be hashed into a string to sign.
   */
  toString(): string {
    const { method, url, headers, body } = this.signedRequest;

    return [
      method.toUpperCase(),
      simIamSigV4CanonicalPath(url.pathname),
      simIamSigV4CanonicalQuery(url.searchParams),
      `${this.canonicalHeaders.toString()}\n`,
      this.canonicalHeaders.signedHeaderList(),
      simIamSigV4PayloadHash(headers, body),
    ].join("\n");
  }
}

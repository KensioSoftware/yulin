import type { SimIamSigV4SignatureStatement } from "../sim-iam-sigv4-signature-statement.js";
import type { SimIamSigV4SignedRequest } from "../sim-iam-sigv4-signed-request.js";
import { SimIamSigV4CanonicalHeaders } from "./sim-iam-sigv4-canonical-headers.js";
import { simIamSigV4CanonicalPath } from "./sim-iam-sigv4-canonical-path.js";
import { simIamSigV4CanonicalQuery } from "./sim-iam-sigv4-canonical-query.js";
import { SimIamSigV4PayloadDeclaration } from "./sim-iam-sigv4-payload-hash.js";

/**
 * The canonical form of a signed request: the exact bytes a signature is made
 * over.
 *
 * Rebuilding this from the request as received, and getting the same signature
 * out, is the whole of SigV4 verification. Anything the canonical form covers
 * cannot be altered in transit without detection, and anything it leaves out
 * can be.
 *
 * The statement the request carries says which headers are signed and which
 * service the signature is scoped to. Both belong to the canonical form. S3
 * canonicalizes its path by a rule of its own, and the client read that rule
 * from the scope it signed under.
 */
export class SimIamSigV4CanonicalRequest {
  private readonly canonicalHeaders: SimIamSigV4CanonicalHeaders;
  private readonly signedRequest: SimIamSigV4SignedRequest;
  private readonly statement: SimIamSigV4SignatureStatement;
  private readonly payload: SimIamSigV4PayloadDeclaration;

  constructor(
    signedRequest: SimIamSigV4SignedRequest,
    statement: SimIamSigV4SignatureStatement,
    payload: SimIamSigV4PayloadDeclaration = SimIamSigV4PayloadDeclaration.fromHeaders(
      signedRequest.headers,
    ),
  ) {
    this.signedRequest = signedRequest;
    this.statement = statement;
    this.payload = payload;
    this.canonicalHeaders = new SimIamSigV4CanonicalHeaders(
      signedRequest.headers,
      statement.signedHeaderNames,
      signedRequest.url,
    );
  }

  /**
   * The canonical request string, ready to be hashed into a string to sign.
   */
  toString(): string {
    const { method, url, body } = this.signedRequest;

    return [
      method.toUpperCase(),
      simIamSigV4CanonicalPath(url.pathname, this.statement.scope.serviceName),
      simIamSigV4CanonicalQuery(url.search),
      `${this.canonicalHeaders.toString()}\n`,
      this.canonicalHeaders.signedHeaderList(),
      this.payload.hashFor(body),
    ].join("\n");
  }
}

/**
 * The AWS error codes a SigV4 request can be rejected with.
 *
 * These are the codes real AWS returns, so a caller handling a rejection can
 * treat a simulated one exactly as it treats the real thing.
 */
export type SimIamSigV4ErrorCode =
  | "ExpiredToken"
  | "IncompleteSignature"
  | "InvalidClientTokenId"
  | "SignatureDoesNotMatch";

/**
 * Base error for a rejected SigV4 signed request.
 */
export class SimIamSigV4Error extends Error {
  public readonly code: SimIamSigV4ErrorCode;

  constructor(code: SimIamSigV4ErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/**
 * Raised when the Authorization header is absent or does not carry the parts a
 * SigV4 signature is made of.
 */
export class SimIamIncompleteSignature extends SimIamSigV4Error {
  constructor(message: string) {
    super("IncompleteSignature", message);
  }
}

/**
 * Raised when the signing access key is unknown, inactive, or presented with a
 * session token that does not belong to it.
 */
export class SimIamInvalidClientTokenId extends SimIamSigV4Error {
  constructor(message: string) {
    super("InvalidClientTokenId", message);
  }
}

/**
 * Raised when the signing credentials belong to a session that has expired in
 * simulated time.
 */
export class SimIamExpiredToken extends SimIamSigV4Error {
  constructor(message: string) {
    super("ExpiredToken", message);
  }
}

/**
 * Raised when the request does not reproduce the signature it carries.
 *
 * The message says which part of the canonical request the simulator built, so
 * a mismatch can be diagnosed without re-deriving it by hand.
 */
export class SimIamSignatureDoesNotMatch extends SimIamSigV4Error {
  public readonly canonicalRequest?: string | undefined;

  constructor(message: string, canonicalRequest?: string) {
    super("SignatureDoesNotMatch", message);
    this.canonicalRequest = canonicalRequest;
  }
}

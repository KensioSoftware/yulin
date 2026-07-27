import { SimIamSigV4CanonicalRequest } from "./canonical/sim-iam-sigv4-canonical-request.js";
import type { SimIamSigV4PayloadDeclaration } from "./canonical/sim-iam-sigv4-payload-hash.js";
import { SimIamSignatureDoesNotMatch } from "./error/sim-iam-sigv4.error.js";
import { simIamSigV4SignaturesMatch } from "./sim-iam-sigv4-signature-match.js";
import type { SimIamSigV4SignatureStatement } from "./sim-iam-sigv4-signature-statement.js";
import type { SimIamSigV4SignedRequest } from "./sim-iam-sigv4-signed-request.js";
import {
  simIamSigV4Signature,
  simIamSigV4StringToSign,
} from "./sim-iam-sigv4-signing-key.js";

interface SimIamSigV4SignatureCheckInput {
  readonly signedRequest: SimIamSigV4SignedRequest;
  readonly statement: SimIamSigV4SignatureStatement;
  readonly signingKey: Buffer;
  readonly amzDate: string;
  /**
   * How the request declared its payload hash. Omitted for a header-signed
   * request, which declares it in a header the canonical request can read for
   * itself.
   */
  readonly payload?: SimIamSigV4PayloadDeclaration | undefined;
}

/**
 * Rebuild the signature the request should carry, and refuse it otherwise.
 *
 * The canonical request travels with the failure, because a mismatch is
 * otherwise undiagnosable: the only way to see which byte differed is to have
 * the bytes the simulator signed over.
 */
export function simIamSigV4CheckSignature(
  input: SimIamSigV4SignatureCheckInput,
): void {
  const { signedRequest, statement, signingKey, amzDate, payload } = input;

  const canonicalRequest = new SimIamSigV4CanonicalRequest(
    signedRequest,
    statement.signedHeaderNames,
    payload,
  ).toString();

  const expected = simIamSigV4Signature(
    signingKey,
    simIamSigV4StringToSign({
      amzDate,
      scope: statement.scope,
      canonicalRequest,
    }),
  );

  if (!simIamSigV4SignaturesMatch(expected, statement.signature)) {
    throw new SimIamSignatureDoesNotMatch(
      `Request signature does not match the signature the simulator ` +
        `calculated for access key ${statement.accessKeyId}`,
      canonicalRequest,
    );
  }
}

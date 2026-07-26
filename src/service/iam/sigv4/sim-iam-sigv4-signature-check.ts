import { SimIamSigV4CanonicalRequest } from "./canonical/sim-iam-sigv4-canonical-request.js";
import { SimIamSignatureDoesNotMatch } from "./error/sim-iam-sigv4.error.js";
import type { SimIamSigV4Authorization } from "./sim-iam-sigv4-authorization.js";
import { simIamSigV4SignaturesMatch } from "./sim-iam-sigv4-signature-match.js";
import type { SimIamSigV4SignedRequest } from "./sim-iam-sigv4-signed-request.js";
import {
  simIamSigV4Signature,
  simIamSigV4StringToSign,
} from "./sim-iam-sigv4-signing-key.js";

interface SimIamSigV4SignatureCheckInput {
  readonly signedRequest: SimIamSigV4SignedRequest;
  readonly authorization: SimIamSigV4Authorization;
  readonly signingKey: Buffer;
  readonly amzDate: string;
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
  const { signedRequest, authorization, signingKey, amzDate } = input;

  const canonicalRequest = new SimIamSigV4CanonicalRequest(
    signedRequest,
    authorization.signedHeaderNames,
  ).toString();

  const expected = simIamSigV4Signature(
    signingKey,
    simIamSigV4StringToSign({
      amzDate,
      scope: authorization.scope,
      canonicalRequest,
    }),
  );

  if (!simIamSigV4SignaturesMatch(expected, authorization.signature)) {
    throw new SimIamSignatureDoesNotMatch(
      `Request signature does not match the signature the simulator ` +
        `calculated for access key ${authorization.accessKeyId}`,
      canonicalRequest,
    );
  }
}

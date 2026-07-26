import type { SimIamCredentialIdentity } from "../credential/sim-aws-credentials.js";
import type { SimIamSigningCredentialResolver } from "../credential/sim-iam-signing-credential.js";
import { SimIamSigV4CanonicalRequest } from "./canonical/sim-iam-sigv4-canonical-request.js";
import { SimIamSignatureDoesNotMatch } from "./error/sim-iam-sigv4.error.js";
import { SimIamSigV4Authorization } from "./sim-iam-sigv4-authorization.js";
import { simIamSigV4CredentialFailure } from "./sim-iam-sigv4-credential-failure.js";
import { simIamSigV4SignaturesMatch } from "./sim-iam-sigv4-signature-match.js";
import { simIamSigV4RequestDate } from "./sim-iam-sigv4-request-date.js";
import type { SimIamSigV4SignedRequest } from "./sim-iam-sigv4-signed-request.js";
import {
  simIamSigV4Signature,
  simIamSigV4StringToSign,
} from "./sim-iam-sigv4-signing-key.js";

interface SimIamSigV4VerifierProperties {
  readonly credentials: SimIamSigningCredentialResolver;
}

/**
 * Verifies the SigV4 signature on a request and resolves who signed it.
 *
 * This is authentication, not authorization: the answer is which simulated
 * principal made the request, which is exactly the question the IAM
 * authorization already built has no way to ask of an HTTP request.
 *
 * Verification needs no clock. The signing date is an input to the signing key
 * and comes from the request, so a correctly signed request verifies whenever
 * it arrives. Only the credentials behind it can go stale, and that is judged in
 * simulated time by the registry.
 */
export class SimIamSigV4Verifier {
  private readonly credentials: SimIamSigningCredentialResolver;

  constructor(properties: SimIamSigV4VerifierProperties) {
    this.credentials = properties.credentials;
  }

  /**
   * Verify a signed request, returning the identity that signed it.
   *
   * Throws a SimIamSigV4Error carrying the AWS error code real AWS would answer
   * with when the request cannot be attributed to a registered access key.
   */
  verify(
    signedRequest: SimIamSigV4SignedRequest,
    now?: Date,
  ): SimIamCredentialIdentity {
    const authorization = SimIamSigV4Authorization.parse(
      signedRequest.headers.get("authorization"),
    );
    const amzDate = simIamSigV4RequestDate(
      signedRequest.headers,
      authorization.scope,
    );

    const { signingKey, identity } = simIamSigV4CredentialFailure(
      authorization.accessKeyId,
      () =>
        this.credentials.signingCredentialFor({
          accessKeyId: authorization.accessKeyId,
          sessionToken:
            signedRequest.headers.get("x-amz-security-token") ?? undefined,
          scope: authorization.scope,
          now,
        }),
    );

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

    return identity;
  }
}

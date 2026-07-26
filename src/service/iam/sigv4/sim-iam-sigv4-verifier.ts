import type { SimIamCredentialIdentity } from "../credential/sim-aws-credentials.js";
import type { SimIamSigningCredentialResolver } from "../credential/sim-iam-signing-credential.js";
import { SimIamSigV4Authorization } from "./sim-iam-sigv4-authorization.js";
import { simIamSigV4CheckExpectedScope } from "./sim-iam-sigv4-expected-scope.js";
import { simIamSigV4CheckSignature } from "./sim-iam-sigv4-signature-check.js";
import { simIamSigV4RequestDate } from "./sim-iam-sigv4-request-date.js";
import type { SimIamSigV4SignedRequest } from "./sim-iam-sigv4-signed-request.js";
import { simIamSigV4SigningCredential } from "./sim-iam-sigv4-signing-credentials.js";
import type { SimIamSigV4VerifyOptions } from "./sim-iam-sigv4-verify-options.js";

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
    options: SimIamSigV4VerifyOptions = {},
  ): SimIamCredentialIdentity {
    const authorization = SimIamSigV4Authorization.parse(
      signedRequest.headers.get("authorization"),
    );

    // Checked before anything else can fail on it, so a signature made for the
    // wrong endpoint says so rather than looking like a bad secret.
    simIamSigV4CheckExpectedScope(options.expectedScope, authorization.scope);

    const amzDate = simIamSigV4RequestDate(
      signedRequest.headers,
      authorization.scope,
    );
    const { signingKey, identity } = simIamSigV4SigningCredential(
      this.credentials,
      signedRequest,
      authorization,
      options.now,
    );

    simIamSigV4CheckSignature({
      signedRequest,
      authorization,
      signingKey,
      amzDate,
    });

    return identity;
  }
}

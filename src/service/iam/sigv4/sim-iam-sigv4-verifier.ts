import type { SimIamCredentialIdentity } from "../credential/sim-aws-credentials.js";
import type { SimIamSigningCredentialResolver } from "../credential/sim-iam-signing-credential.js";
import { SimIamSigV4PayloadDeclaration } from "./canonical/sim-iam-sigv4-payload-hash.js";
import { SimIamSigV4PresignedQuery } from "./presign/sim-iam-sigv4-presigned-query.js";
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
 * A signature arrives in one of two forms, an `Authorization` header or the
 * query string of a presigned URL, and both are verified here. The work either
 * way is the same canonical request against the same signing key; only where
 * the claims are read from, and whether a lifetime is stated, differ.
 *
 * Verifying a header-signed request needs no clock. The signing date is an
 * input to the signing key and comes from the request, so a correctly signed
 * request verifies whenever it arrives. Only the credentials behind it can go
 * stale, and that is judged in simulated time by the registry. A presigned URL
 * is the exception, because it states its own expiry.
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
    if (SimIamSigV4PresignedQuery.carriedBy(signedRequest.url)) {
      return this.verifyPresigned(signedRequest, options);
    }

    return this.verifyHeaderSigned(signedRequest, options);
  }

  private verifyHeaderSigned(
    signedRequest: SimIamSigV4SignedRequest,
    options: SimIamSigV4VerifyOptions,
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
    const { signingKey, identity } = simIamSigV4SigningCredential({
      credentials: this.credentials,
      statement: authorization,
      sessionToken:
        signedRequest.headers.get("x-amz-security-token") ?? undefined,
      now: options.now,
    });

    simIamSigV4CheckSignature({
      signedRequest,
      statement: authorization,
      signingKey,
      amzDate,
    });

    return identity;
  }

  /**
   * Verify a presigned URL.
   *
   * Expiry is checked before the signature, because an expired URL is the
   * likeliest reason a presigned request fails and "this expired" is a far
   * more useful thing to be told than "this signature does not match". The
   * expiry is signed, so a URL cannot claim a longer life than it was given.
   */
  private verifyPresigned(
    signedRequest: SimIamSigV4SignedRequest,
    options: SimIamSigV4VerifyOptions,
  ): SimIamCredentialIdentity {
    const presigned = SimIamSigV4PresignedQuery.parse(signedRequest.url);

    simIamSigV4CheckExpectedScope(options.expectedScope, presigned.scope);
    presigned.checkNotExpired(options.now ?? new Date());

    const { signingKey, identity } = simIamSigV4SigningCredential({
      credentials: this.credentials,
      statement: presigned,
      sessionToken: presigned.sessionToken,
      now: options.now,
    });

    simIamSigV4CheckSignature({
      signedRequest,
      statement: presigned,
      signingKey,
      amzDate: presigned.amzDate,
      payload: SimIamSigV4PayloadDeclaration.fromPresignedQuery(
        signedRequest.url,
      ),
    });

    return identity;
  }
}

import type {
  SimIamSigningCredential,
  SimIamSigningCredentialResolver,
} from "../credential/sim-iam-signing-credential.js";
import type { SimIamSigV4Authorization } from "./sim-iam-sigv4-authorization.js";
import { simIamSigV4CredentialFailure } from "./sim-iam-sigv4-credential-failure.js";
import type { SimIamSigV4SignedRequest } from "./sim-iam-sigv4-signed-request.js";

/**
 * Find the signing key the request claims to have been signed with.
 *
 * A signed request never presents its secret, so this asks for the key the
 * named access key would have derived rather than for the secret itself, and
 * the signature comparison settles whether the signer really held it. Any
 * rejection is restated in the vocabulary a signed request is answered in.
 */
export function simIamSigV4SigningCredential(
  credentials: SimIamSigningCredentialResolver,
  signedRequest: SimIamSigV4SignedRequest,
  authorization: SimIamSigV4Authorization,
  now: Date | undefined,
): SimIamSigningCredential {
  return simIamSigV4CredentialFailure(authorization.accessKeyId, () =>
    credentials.signingCredentialFor({
      accessKeyId: authorization.accessKeyId,
      sessionToken:
        signedRequest.headers.get("x-amz-security-token") ?? undefined,
      scope: authorization.scope,
      now,
    }),
  );
}

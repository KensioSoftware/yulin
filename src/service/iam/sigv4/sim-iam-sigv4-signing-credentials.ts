import type {
  SimIamSigningCredential,
  SimIamSigningCredentialResolver,
} from "../credential/sim-iam-signing-credential.js";
import { simIamSigV4CredentialFailure } from "./sim-iam-sigv4-credential-failure.js";
import type { SimIamSigV4SignatureStatement } from "./sim-iam-sigv4-signature-statement.js";

interface SimIamSigV4SigningCredentialInput {
  readonly credentials: SimIamSigningCredentialResolver;
  readonly statement: SimIamSigV4SignatureStatement;
  readonly sessionToken: string | undefined;
  readonly now: Date | undefined;
}

/**
 * Find the signing key the request claims to have been signed with.
 *
 * A signed request never presents its secret, so this asks for the key the
 * named access key would have derived rather than for the secret itself, and
 * the signature comparison settles whether the signer really held it. Any
 * rejection is restated in the vocabulary a signed request is answered in.
 *
 * The session token comes from wherever the request carried it: a header on a
 * header-signed request, a query parameter on a presigned URL.
 */
export function simIamSigV4SigningCredential(
  input: SimIamSigV4SigningCredentialInput,
): SimIamSigningCredential {
  const { credentials, statement, sessionToken, now } = input;

  return simIamSigV4CredentialFailure(statement.accessKeyId, () =>
    credentials.signingCredentialFor({
      accessKeyId: statement.accessKeyId,
      sessionToken,
      scope: statement.scope,
      now,
    }),
  );
}

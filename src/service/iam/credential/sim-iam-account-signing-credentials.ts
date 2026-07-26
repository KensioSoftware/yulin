import { simIamSigV4SigningKey } from "../sigv4/sim-iam-sigv4-signing-key.js";
import type { SimIamCredentialRegistry } from "./sim-iam-credential-registry.js";
import type {
  SimIamSigningCredential,
  SimIamSigningCredentialInput,
  SimIamSigningCredentialResolver,
} from "./sim-iam-signing-credential.js";

/**
 * Derives signing keys for one Account's access keys.
 *
 * Storing and authenticating access keys belongs to the credential registry.
 * Turning an authenticated key into something a signature can be checked
 * against is a separate job, and it is this one.
 *
 * What leaves here is a key derived for a single date, Region and service, so
 * it cannot be used to sign anything outside the scope it was asked for.
 */
export class SimIamAccountSigningCredentials implements SimIamSigningCredentialResolver {
  private readonly credentials: SimIamCredentialRegistry;

  constructor(credentials: SimIamCredentialRegistry) {
    this.credentials = credentials;
  }

  /**
   * Authenticate an access key and derive its signing key for a scope.
   */
  signingCredentialFor(
    input: SimIamSigningCredentialInput,
  ): SimIamSigningCredential {
    const accessKey = this.credentials.authenticateAccessKey(
      input.accessKeyId,
      input.sessionToken,
      input.now,
    );

    return {
      signingKey: simIamSigV4SigningKey(accessKey.secretAccessKey, input.scope),
      identity: accessKey.identity(),
    };
  }
}

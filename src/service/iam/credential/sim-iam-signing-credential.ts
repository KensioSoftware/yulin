import type { SimIamSigV4CredentialScope } from "../sigv4/sim-iam-sigv4-credential-scope.js";
import type { SimIamCredentialIdentity } from "./sim-aws-credentials.js";

/**
 * Records access keys somewhere beyond one Account's own registry.
 */
export interface SimIamAccessKeyIndex {
  registerAccessKey(accessKeyId: string): void;
}

export interface SimIamSigningCredentialInput {
  readonly accessKeyId: string;
  readonly sessionToken?: string | undefined;
  readonly scope: SimIamSigV4CredentialScope;
  readonly now?: Date | undefined;
}

/**
 * A signing key scoped to one date, Region and service, with the identity it
 * belongs to.
 */
export interface SimIamSigningCredential {
  readonly signingKey: Buffer;
  readonly identity: SimIamCredentialIdentity;
}

/**
 * Resolves the signing key an access key would have signed with.
 *
 * Implemented by the Account-scoped credential registry, and by the
 * simulation-wide resolver that finds which Account owns an access key first.
 */
export interface SimIamSigningCredentialResolver {
  signingCredentialFor(
    input: SimIamSigningCredentialInput,
  ): SimIamSigningCredential;
}

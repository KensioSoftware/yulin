import { SimIamInvalidCredentials } from "../credential/error/sim-iam-credential.error.js";
import { SimIamAccountSigningCredentials } from "../credential/sim-iam-account-signing-credentials.js";
import type {
  SimIamSigningCredential,
  SimIamSigningCredentialInput,
  SimIamSigningCredentialResolver,
} from "../credential/sim-iam-signing-credential.js";
import type { SimIamAccessKeyRegistry } from "./sim-iam-access-key-registry.js";
import type { SimIamAccountResolver } from "./sim-iam-account-resolver.js";

interface SimIamGlobalCredentialResolverProperties {
  readonly accessKeys: SimIamAccessKeyRegistry;
  readonly iam: SimIamAccountResolver;
}

/**
 * Resolves signing credentials across every Account in one simulation.
 *
 * A signed request identifies an access key but not an Account, so the owning
 * Account is looked up first and its own credential registry does the
 * authenticating. Authority stays with the Account that issued the key.
 */
export class SimIamGlobalCredentialResolver implements SimIamSigningCredentialResolver {
  private readonly accessKeys: SimIamAccessKeyRegistry;
  private readonly iam: SimIamAccountResolver;

  constructor(properties: SimIamGlobalCredentialResolverProperties) {
    this.accessKeys = properties.accessKeys;
    this.iam = properties.iam;
  }

  /**
   * Authenticate an access key belonging to any Account in this simulation.
   */
  signingCredentialFor(
    input: SimIamSigningCredentialInput,
  ): SimIamSigningCredential {
    const accountId = this.accessKeys.accountIdForAccessKey(input.accessKeyId);

    if (accountId === undefined) {
      throw new SimIamInvalidCredentials({
        accessKeyId: input.accessKeyId,
        reason: "unknown-access-key",
      });
    }

    return new SimIamAccountSigningCredentials(
      this.iam.iamForAccount(accountId).credentials,
    ).signingCredentialFor(input);
  }
}

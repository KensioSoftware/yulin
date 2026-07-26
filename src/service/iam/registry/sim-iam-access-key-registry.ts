import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";

/**
 * Simulation-wide index of which Account owns an access key.
 *
 * IAM state is Account-scoped, but a signed request names only an access key
 * id: nothing in a signature says which Account to ask. This index supplies
 * that missing hop, as the Function URL registry does for URL ids.
 *
 * It indexes access keys but does not own them. The owning Account's credential
 * registry remains the only thing that can authenticate one.
 */
export class SimIamAccessKeyRegistry {
  private readonly accountIdByAccessKeyId = new Map<string, SimAwsAccountId>();

  /**
   * Record which Account an access key belongs to.
   */
  registerAccessKey(accessKeyId: string, accountId: SimAwsAccountId): void {
    this.accountIdByAccessKeyId.set(accessKeyId, accountId);
  }

  /**
   * Find the Account that owns an access key, if any Account does.
   */
  accountIdForAccessKey(accessKeyId: string): SimAwsAccountId | undefined {
    return this.accountIdByAccessKeyId.get(accessKeyId);
  }
}

/**
 * Records access keys registered by one Account's credential registry.
 *
 * The credential registry knows nothing about Accounts, so the Account it
 * belongs to is bound here instead of being threaded through every caller that
 * registers a key.
 */
export class SimIamAccountAccessKeyIndex {
  private readonly registry: SimIamAccessKeyRegistry;
  private readonly accountId: SimAwsAccountId;

  constructor(registry: SimIamAccessKeyRegistry, accountId: SimAwsAccountId) {
    this.registry = registry;
    this.accountId = accountId;
  }

  /**
   * Record an access key as belonging to this index's Account.
   */
  registerAccessKey(accessKeyId: string): void {
    this.registry.registerAccessKey(accessKeyId, this.accountId);
  }
}

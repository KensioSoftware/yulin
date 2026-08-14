import { parseSimArn } from "../../aws/arn.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimKmsKey } from "../key/sim-kms-key.js";
import type { SimKms } from "../sim-kms.js";

type SimKmsScopeKey = string;

/**
 * How another simulated service gets from a key ARN to the key it names.
 *
 * Named as an interface so a service depending on it depends on the lookup
 * rather than on the whole of KMS.
 */
export interface SimKmsKeyResolver {
  key(keyArn: string): SimKmsKey | undefined;
}

/**
 * Simulation-wide registry of Account/Region-scoped KMS facades.
 *
 * One registry belongs to one SimAws environment. KMS is scoped to an account
 * and Region, but other services hold only a key ARN, so this is how they get
 * from that ARN back to the key it names. Route53 uses it to check the
 * customer managed key a key-signing key is built on.
 *
 * The registry indexes KMS facades but does not create or own them.
 */
export class SimKmsRegistry implements SimKmsKeyResolver {
  private readonly kmsByScope = new Map<SimKmsScopeKey, SimKms>();

  /**
   * Register the KMS facade belonging to an Account and Region.
   */
  register(accountRegionScope: SimAwsAccountRegionScope, kms: SimKms): void {
    this.kmsByScope.set(scopeKey(accountRegionScope), kms);
  }

  /**
   * Find the key an ARN names, wherever in the simulation it lives.
   *
   * Undefined covers every way an ARN can fail to name a key: it is not an
   * ARN, it is not a KMS ARN, its account and Region hold no simulated KMS, or
   * that KMS holds no such key. Callers report the failure in their own terms,
   * as AWS services do.
   */
  key(keyArn: string): SimKmsKey | undefined {
    const arn = parseSimArn(keyArn);

    if (arn?.service !== "kms") {
      return undefined;
    }

    const kms = this.kmsByScope.get(
      scopeKey({ accountId: arn.accountId, regionName: arn.region }),
    );

    return kms?.findKey(keyArn);
  }
}

function scopeKey(
  accountRegionScope: SimAwsAccountRegionScope,
): SimKmsScopeKey {
  return `${accountRegionScope.accountId}:${accountRegionScope.regionName}`;
}

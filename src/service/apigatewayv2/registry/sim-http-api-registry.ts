import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { makeSimHttpApiId, type SimHttpApiId } from "../api/sim-http-api-id.js";

/**
 * Simulated API Gateway cross-Account registry of API ids.
 *
 * A served request carries its region in the hostname, but not the Account.
 * Simulated API Gateway state is per Account/Region, so the serving layer
 * needs a way to get from an API id to the Account that owns it. This registry
 * is that lookup, which is why API ids are allocated here and are unique
 * across every Account and Region of one simulated AWS environment.
 */
export class SimHttpApiRegistry {
  private readonly apiAccountIds = new Map<SimHttpApiId, SimAwsAccountId>();

  /**
   * Allocate an API id that is unique in this simulated AWS, and register it
   * to the Account that will own it.
   *
   * Allocation and registration are one step because an id nothing owns is not
   * a useful thing to hold: it would resolve to no Account and route nowhere.
   */
  allocateApiId(accountId: SimAwsAccountId): SimHttpApiId {
    let apiId = makeSimHttpApiId();

    while (this.apiAccountIds.has(apiId)) {
      /* v8 ignore next -- does not happen in practice */
      apiId = makeSimHttpApiId();
    }

    this.apiAccountIds.set(apiId, accountId);

    return apiId;
  }

  /**
   * Forget a deleted API's id, so its endpoint stops resolving.
   */
  deregisterApi(apiId: SimHttpApiId): void {
    this.apiAccountIds.delete(apiId);
  }

  /**
   * Get the Account that owns an API id, if it is registered.
   */
  accountIdForApi(apiId: string): SimAwsAccountId | undefined {
    return this.apiAccountIds.get(apiId as SimHttpApiId);
  }
}

import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { makeSimRestApiId, type SimRestApiId } from "../api/sim-rest-api-id.js";

/**
 * Simulated API Gateway cross-Account registry of REST API ids.
 *
 * A served request carries its Region in the hostname and no Account, while
 * simulated API Gateway state is per Account and Region. This registry is the
 * hop from an API id to the Account owning it, which is why REST API ids are
 * allocated here and are unique across every Account and Region of one
 * simulated AWS environment.
 *
 * REST APIs and HTTP APIs share the `execute-api` hostname namespace on real
 * AWS, and their ids have the same shape. Each service registers its own ids
 * here and in the HTTP API registry, and resolving a served hostname across
 * both belongs with the serving layer that does the resolving.
 */
export class SimRestApiRegistry {
  private readonly apiAccountIds = new Map<SimRestApiId, SimAwsAccountId>();

  /**
   * Allocate a REST API id that is unique in this simulated AWS, and register
   * it to the Account that will own it.
   *
   * Allocation and registration are one step, because an id nothing owns
   * resolves to no Account and routes nowhere.
   */
  allocateApiId(accountId: SimAwsAccountId): SimRestApiId {
    let apiId = makeSimRestApiId();

    while (this.apiAccountIds.has(apiId)) {
      /* v8 ignore next -- does not happen in practice */
      apiId = makeSimRestApiId();
    }

    this.apiAccountIds.set(apiId, accountId);

    return apiId;
  }

  /**
   * Forget a deleted API's id, so its endpoint stops resolving.
   */
  deregisterApi(apiId: SimRestApiId): void {
    this.apiAccountIds.delete(apiId);
  }

  /**
   * Get the Account that owns a REST API id, if it is registered.
   */
  accountIdForApi(apiId: string): SimAwsAccountId | undefined {
    return this.apiAccountIds.get(apiId as SimRestApiId);
  }
}

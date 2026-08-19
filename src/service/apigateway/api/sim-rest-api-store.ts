import type { SimRestApiId } from "./sim-rest-api-id.js";
import type { SimRestApi } from "./sim-rest-api.js";

/**
 * The REST APIs of one Account and Region, keyed by id.
 *
 * A REST API has no unique name on real AWS. Two APIs in one Account and
 * Region may share a name, and only the id tells them apart, so that is what
 * this stores them by.
 */
export class SimRestApiStore {
  private readonly apis = new Map<SimRestApiId, SimRestApi>();

  /**
   * Add an API to this scope.
   */
  add(api: SimRestApi): void {
    this.apis.set(api.apiId, api);
  }

  /**
   * Find an API by id.
   */
  find(apiId: string): SimRestApi | undefined {
    return this.apis.get(apiId as SimRestApiId);
  }

  /**
   * Forget an API, as DeleteRestApi does.
   */
  remove(apiId: SimRestApiId): void {
    this.apis.delete(apiId);
  }

  /**
   * List every API in this scope, in the order they were created.
   */
  list(): SimRestApi[] {
    return this.apis.values().toArray();
  }
}

import type { SimHttpApi } from "./sim-http-api.js";
import type { SimHttpApiId } from "./sim-http-api-id.js";

/**
 * The APIs of one Account and Region, keyed by id.
 *
 * An API has no unique name on real AWS: two APIs in one Account and Region
 * may share a name, and only the id tells them apart, so that is what this
 * stores them by.
 */
export class SimHttpApiStore {
  private readonly apis = new Map<SimHttpApiId, SimHttpApi>();

  /**
   * Add an API to this scope.
   */
  add(api: SimHttpApi): void {
    this.apis.set(api.apiId, api);
  }

  /**
   * Find an API by id.
   */
  find(apiId: string): SimHttpApi | undefined {
    return this.apis.get(apiId as SimHttpApiId);
  }

  /**
   * Forget an API, as DeleteApi does.
   */
  remove(apiId: SimHttpApiId): void {
    this.apis.delete(apiId);
  }

  /**
   * List every API in this scope, in the order they were created.
   */
  list(): SimHttpApi[] {
    return this.apis.values().toArray();
  }
}

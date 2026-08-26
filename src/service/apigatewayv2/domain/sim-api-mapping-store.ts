import {
  makeSimApiMappingId,
  type SimApiMappingId,
} from "./sim-api-mapping-id.js";
import type { SimApiMapping } from "./sim-api-mapping.js";

/**
 * The API mappings of one custom domain, keyed by the id API Gateway
 * allocated for each.
 *
 * A mapping is addressed by that id rather than by its base path, which is
 * what `DeleteApiMapping` takes, so that is what they are stored by.
 */
export class SimApiMappingStore {
  private readonly mappings = new Map<SimApiMappingId, SimApiMapping>();

  /**
   * Allocate a mapping id this domain is not already using.
   */
  allocateId(): SimApiMappingId {
    let apiMappingId = makeSimApiMappingId();

    while (this.mappings.has(apiMappingId)) {
      /* v8 ignore next -- does not happen in practice */
      apiMappingId = makeSimApiMappingId();
    }

    return apiMappingId;
  }

  /**
   * Add a mapping to this domain.
   */
  add(mapping: SimApiMapping): void {
    this.mappings.set(mapping.apiMappingId, mapping);
  }

  /**
   * Find a mapping by id.
   */
  find(apiMappingId: string): SimApiMapping | undefined {
    return this.mappings.get(apiMappingId as SimApiMappingId);
  }

  /**
   * Find the mapping already serving a base path, if this domain has one.
   */
  findByKey(key: string): SimApiMapping | undefined {
    return this.list().find((mapping) => mapping.apiMappingKey.value === key);
  }

  /**
   * Forget a deleted mapping.
   */
  remove(apiMappingId: SimApiMappingId): void {
    this.mappings.delete(apiMappingId);
  }

  /**
   * Forget every mapping pointing at an API, which is what deleting that API
   * leaves behind.
   */
  removeForApi(apiId: string): void {
    for (const mapping of this.list()) {
      if (mapping.apiId === apiId) {
        this.mappings.delete(mapping.apiMappingId);
      }
    }
  }

  /**
   * List every mapping of this domain, in the order they were created.
   */
  list(): SimApiMapping[] {
    return this.mappings.values().toArray();
  }

  /**
   * Pick the mapping serving a request path.
   *
   * The longest matching base path wins, so a domain mapping both the root and
   * `orders` serves `/orders/6` from the `orders` mapping and `/pets/6` from
   * the root one. A domain with no root mapping serves nothing under a path no
   * base path claims.
   */
  select(pathSegments: readonly string[]): SimApiMapping | undefined {
    return this.list()
      .filter((mapping) => mapping.apiMappingKey.matches(pathSegments))
      .toSorted(
        (one, other) => other.apiMappingKey.depth - one.apiMappingKey.depth,
      )
      .at(0);
  }
}

import {
  SimWafDuplicateItemException,
  SimWafNonexistentItemException,
} from "../error/sim-wafv2.error.js";
import type { SimWafScope } from "../scope/sim-waf-scope.js";
import type { SimWafResource } from "./sim-waf-resource.js";

/**
 * How one WAFv2 resource is asked for.
 *
 * All three reads take the same three parts, because a name is unique within a
 * scope but is not on its own what a resource is: the id says which of two
 * resources created under that name over time this one is.
 */
export interface SimWafResourceKey {
  readonly scope: SimWafScope;
  readonly name: string;
  readonly id?: string | undefined;
}

/**
 * The WAFv2 resources of one kind in one account and region.
 *
 * `CLOUDFRONT` and `REGIONAL` are separate namespaces here as on AWS, which is
 * why the scope is part of every lookup rather than a property to filter on.
 */
export class SimWafResourceStore<T extends SimWafResource> {
  readonly #kindLabel: string;
  readonly #resources = new Map<string, T>();

  constructor(kindLabel: string) {
    this.#kindLabel = kindLabel;
  }

  /**
   * Every resource in one scope, in the order they were created.
   */
  all(scope: SimWafScope): readonly T[] {
    return this.#resources
      .values()
      .filter((resource) => resource.scope === scope)
      .toArray();
  }

  /**
   * Hold a new resource, refusing a name that is taken.
   */
  add(resource: T): T {
    const key = storeKey(resource.scope, resource.name);

    if (this.#resources.has(key)) {
      throw new SimWafDuplicateItemException(
        `AWS WAF couldn't perform the operation because some resource in ` +
          `your account already has the name ${resource.name}.`,
      );
    }

    this.#resources.set(key, resource);

    return resource;
  }

  /**
   * Find a resource, or nothing when the scope, name and id name none.
   */
  find(key: SimWafResourceKey): T | undefined {
    const found = this.#resources.get(storeKey(key.scope, key.name));

    if (found === undefined || (key.id !== undefined && found.id !== key.id)) {
      return undefined;
    }

    return found;
  }

  /**
   * Find a resource by its ARN, or nothing when this store holds none.
   *
   * A rule referring to another WAFv2 resource carries its ARN and nothing
   * else, which is what this is for.
   */
  findByArn(arn: string): T | undefined {
    return this.#resources.values().find((resource) => resource.arn === arn);
  }

  /**
   * Get a resource, refusing one that is not there.
   */
  require(key: SimWafResourceKey): T {
    const found = this.find(key);

    if (found === undefined) {
      throw new SimWafNonexistentItemException(
        `AWS WAF couldn't perform the operation because your resource ` +
          `doesn't exist: ${this.#kindLabel} ${key.name}.`,
      );
    }

    return found;
  }

  /**
   * Remove a resource.
   */
  remove(resource: T): void {
    this.#resources.delete(storeKey(resource.scope, resource.name));
  }
}

function storeKey(scope: SimWafScope, name: string): string {
  return `${scope}:${name}`;
}

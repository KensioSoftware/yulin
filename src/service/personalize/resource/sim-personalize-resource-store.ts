import {
  SimPersonalizeInvalidInputException,
  SimPersonalizeResourceAlreadyExistsException,
  SimPersonalizeResourceNotFoundException,
} from "../error/sim-personalize.error.js";
import { isSimPersonalizeArn } from "./sim-personalize-arn.js";
import type { SimPersonalizeResource } from "./sim-personalize-resource.js";

interface SimPersonalizeResourceStoreProperties {
  /**
   * What this store holds, as an error message names it. "dataset group",
   * "solution", "campaign".
   */
  readonly description: string;
}

/**
 * The resources of one type in one simulated Personalize scope, keyed by ARN.
 *
 * Every Personalize resource is named by ARN once it exists and by name only
 * while it is being created, which is why the ARN is the key and the name
 * lookup is the secondary one.
 */
export class SimPersonalizeResourceStore<T extends SimPersonalizeResource> {
  private readonly resources = new Map<string, T>();
  private readonly description: string;

  constructor(properties: SimPersonalizeResourceStoreProperties) {
    this.description = properties.description;
  }

  /**
   * Every resource in this store, in creation order.
   */
  get all(): readonly T[] {
    return this.resources.values().toArray();
  }

  /**
   * Store a newly created resource.
   */
  add(resource: T): void {
    this.resources.set(resource.arn, resource);
  }

  /**
   * Forget a resource, as deleting it does.
   */
  remove(resource: T): void {
    this.resources.delete(resource.arn);
  }

  /**
   * The resource an ARN names, or undefined where this store holds none.
   */
  find(arn: string): T | undefined {
    return this.resources.get(arn);
  }

  /**
   * The resource a name belongs to, or undefined where this store holds none.
   */
  findByName(name: string): T | undefined {
    return this.resources.values().find((resource) => resource.name === name);
  }

  /**
   * Resolve an ARN from request input to the resource it names, or refuse.
   *
   * A missing ARN and one that is not a Personalize ARN at all are invalid
   * input, which is what real Personalize calls them. An ARN of the right
   * shape naming nothing is a missing resource.
   */
  require(arn: string | undefined): T {
    return this.requireOf(this.requireArn(arn));
  }

  /**
   * Read an ARN from request input without resolving it.
   */
  requireArn(arn: string | undefined): string {
    if (arn === undefined || arn === "") {
      throw new SimPersonalizeInvalidInputException(
        `A ${this.description} ARN is required`,
      );
    }

    if (!isSimPersonalizeArn(arn)) {
      throw new SimPersonalizeInvalidInputException(
        `'${arn}' is not a Personalize ARN`,
      );
    }

    return arn;
  }

  /**
   * Refuse a name this store already holds a resource under.
   */
  requireNameAvailable(name: string): void {
    if (this.findByName(name) === undefined) {
      return;
    }

    throw new SimPersonalizeResourceAlreadyExistsException(
      `A ${this.description} named '${name}' already exists`,
    );
  }

  private requireOf(arn: string): T {
    const found = this.find(arn);

    if (found === undefined) {
      throw new SimPersonalizeResourceNotFoundException(
        `Personalize can't find the ${this.description} '${arn}'`,
      );
    }

    return found;
  }
}

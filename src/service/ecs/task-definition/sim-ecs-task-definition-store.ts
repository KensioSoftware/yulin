import { SimEcsClientException } from "../error/sim-ecs.error.js";
import { SimEcsTaskDefinitionFamily } from "./sim-ecs-task-definition-family.js";
import type { SimEcsTaskDefinitionId } from "./sim-ecs-task-definition-id.js";
import type { SimEcsTaskDefinition } from "./sim-ecs-task-definition.js";

/**
 * The simulated ECS task definitions one Account and Region holds.
 *
 * Task definitions are held by family rather than in one flat list, because
 * the family is what a registration adds to and what a describe resolves
 * against. Nothing is ever removed: deregistering marks a revision, and an
 * emptied family would take its revision numbering with it.
 */
export class SimEcsTaskDefinitionStore {
  private readonly familiesByName = new Map<
    string,
    SimEcsTaskDefinitionFamily
  >();

  /**
   * The family of this name, started if this is its first registration.
   */
  family(family: string): SimEcsTaskDefinitionFamily {
    const held = this.familiesByName.get(family);

    if (held !== undefined) {
      return held;
    }

    const started = new SimEcsTaskDefinitionFamily(family);
    this.familiesByName.set(family, started);

    return started;
  }

  /**
   * The families that have ever been registered, oldest first.
   */
  families(): readonly SimEcsTaskDefinitionFamily[] {
    return this.familiesByName.values().toArray();
  }

  /**
   * Every revision of every family, by family name and then revision.
   */
  revisions(): readonly SimEcsTaskDefinition[] {
    return this.families()
      .toSorted((one, other) => one.family.localeCompare(other.family))
      .flatMap((family) => family.all());
  }

  /**
   * Find the revision an identifier names.
   *
   * A family named on its own resolves to its latest active revision, so a
   * family whose revisions have all been deregistered resolves to nothing,
   * while each of those revisions is still there to be named directly.
   */
  resolve(id: SimEcsTaskDefinitionId): SimEcsTaskDefinition {
    const family = this.familiesByName.get(id.family);
    const resolved =
      id.revision === undefined
        ? family?.latestActive()
        : family?.revision(id.revision);

    if (resolved === undefined) {
      throw new SimEcsClientException(
        `Unable to describe task definition. The simulated Account and ` +
          `Region hold no task definition ${this.describeId(id)}.`,
      );
    }

    return resolved;
  }

  private describeId(id: SimEcsTaskDefinitionId): string {
    if (id.revision === undefined) {
      return `family ${id.family} with an active revision`;
    }

    return `${id.family}:${String(id.revision)}`;
  }
}

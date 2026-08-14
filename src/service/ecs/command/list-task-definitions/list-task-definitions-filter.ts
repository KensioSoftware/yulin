import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import type { SimEcsTaskDefinition } from "../../task-definition/sim-ecs-task-definition.js";
import type { SimListTaskDefinitionsCommandInput } from "./list-task-definitions.command.js";

/**
 * Which revisions a listing asked for, and in which order.
 *
 * Real ECS lists the active revisions when the request says nothing about
 * status, so a listing that says nothing is a listing of what is current
 * rather than of everything ever registered.
 */
export class ListTaskDefinitionsFilter {
  private readonly familyPrefix: string | undefined;
  private readonly active: boolean;
  private readonly newestFirst: boolean;

  constructor(input: SimListTaskDefinitionsCommandInput) {
    this.familyPrefix = input.familyPrefix;
    this.active = ListTaskDefinitionsFilter.wantsActive(input.status);
    this.newestFirst = ListTaskDefinitionsFilter.wantsNewestFirst(input.sort);
  }

  private static wantsActive(status: string | undefined): boolean {
    if (status === undefined || status === "ACTIVE") {
      return true;
    }

    if (status === "INACTIVE") {
      return false;
    }

    throw new SimEcsInvalidParameterException(
      `ListTaskDefinitions status ${status} is not one this operation takes. ` +
        `ACTIVE and INACTIVE are.`,
    );
  }

  private static wantsNewestFirst(sort: string | undefined): boolean {
    if (sort === undefined || sort === "ASC") {
      return false;
    }

    if (sort === "DESC") {
      return true;
    }

    throw new SimEcsInvalidParameterException(
      `ListTaskDefinitions sort ${sort} is not one this operation takes. ASC ` +
        `and DESC are.`,
    );
  }

  /**
   * The revisions this listing reports, in the order it reports them.
   */
  apply(
    revisions: readonly SimEcsTaskDefinition[],
  ): readonly SimEcsTaskDefinition[] {
    const matched = revisions.filter((revision) => this.matches(revision));

    if (this.newestFirst) {
      return matched.toReversed();
    }

    return matched;
  }

  private matches(revision: SimEcsTaskDefinition): boolean {
    if (revision.isActive() !== this.active) {
      return false;
    }

    return (
      this.familyPrefix === undefined ||
      revision.family.startsWith(this.familyPrefix)
    );
  }
}

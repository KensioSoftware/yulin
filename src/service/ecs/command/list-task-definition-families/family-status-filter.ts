import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import type { SimEcsTaskDefinitionFamily } from "../../task-definition/sim-ecs-task-definition-family.js";

type FamilyStatus = "ACTIVE" | "INACTIVE" | "ALL";

const familyStatuses: ReadonlySet<string> = new Set([
  "ACTIVE",
  "INACTIVE",
  "ALL",
]);

/**
 * Which families a listing asked for.
 *
 * A family is active while any of its revisions is. `INACTIVE` therefore means
 * a family whose revisions have all been deregistered, which is the only way a
 * family stops being current: nothing removes one.
 */
export class FamilyStatusFilter {
  private readonly familyPrefix: string | undefined;
  private readonly status: FamilyStatus;

  constructor(familyPrefix: string | undefined, status: string | undefined) {
    this.familyPrefix = familyPrefix;
    this.status = FamilyStatusFilter.requestedStatus(status);
  }

  private static requestedStatus(status: string | undefined): FamilyStatus {
    if (status === undefined) {
      return "ACTIVE";
    }

    if (familyStatuses.has(status)) {
      return status as FamilyStatus;
    }

    throw new SimEcsInvalidParameterException(
      `ListTaskDefinitionFamilies status ${status} is not one this operation ` +
        `takes. ACTIVE, INACTIVE and ALL are.`,
    );
  }

  /**
   * The families this listing reports, in registration order.
   */
  apply(
    families: readonly SimEcsTaskDefinitionFamily[],
  ): readonly SimEcsTaskDefinitionFamily[] {
    return families.filter((family) => this.matches(family));
  }

  private matches(family: SimEcsTaskDefinitionFamily): boolean {
    if (
      this.familyPrefix !== undefined &&
      !family.family.startsWith(this.familyPrefix)
    ) {
      return false;
    }

    return this.matchesStatus(family);
  }

  private matchesStatus(family: SimEcsTaskDefinitionFamily): boolean {
    if (this.status === "ALL") {
      return true;
    }

    return family.hasActiveRevision() === (this.status === "ACTIVE");
  }
}

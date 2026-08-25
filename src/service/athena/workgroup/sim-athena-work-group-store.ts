import { SimAthenaInvalidRequestException } from "../error/sim-athena.error.js";
import type { SimAthenaWorkGroup } from "./sim-athena-work-group.js";

/**
 * The workgroups of one simulated Athena scope.
 */
export class SimAthenaWorkGroupStore {
  private readonly workGroups = new Map<string, SimAthenaWorkGroup>();

  /**
   * Every workgroup in this scope, in creation order.
   */
  get all(): readonly SimAthenaWorkGroup[] {
    return this.workGroups.values().toArray();
  }

  /**
   * Store a workgroup, replacing any of that name.
   *
   * Creating one that already exists is refused before it reaches here, so a
   * replacement is only ever an update.
   */
  put(workGroup: SimAthenaWorkGroup): void {
    this.workGroups.set(workGroup.name, workGroup);
  }

  /**
   * Find a workgroup by name.
   */
  find(name: string): SimAthenaWorkGroup | undefined {
    return this.workGroups.get(name);
  }

  /**
   * Resolve a workgroup by name, or refuse.
   */
  require(name: string): SimAthenaWorkGroup {
    const found = this.find(name);

    if (found === undefined) {
      throw new SimAthenaInvalidRequestException(
        `WorkGroup ${name} is not found.`,
      );
    }

    return found;
  }

  /**
   * Forget a deleted workgroup.
   */
  remove(name: string): void {
    this.workGroups.delete(name);
  }
}

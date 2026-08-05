import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import { simCfnResourceDependents } from "../../resource/dependency/sim-cfn-resource-dependents.js";

/**
 * Immutable view of the Resources still pending in the Stack teardown loop.
 *
 * The deletion counterpart of SimCfnStackPendingResources, and the place the
 * dependency graph is read backwards:
 *
 * - expose whether any Resources are still pending
 * - select pending Resources nothing left in the Stack still depends on
 * - return the next pending-set view after a batch has run
 *
 * It does not mutate Resources, delete Resources, or report dependency
 * deadlocks. SimCfnStackResourceDeleter owns the orchestration loop.
 */
export class SimCfnStackPendingDeletions {
  private readonly resources: ReadonlyMap<string, SimCfnResource>;
  private readonly pendingResources: ReadonlySet<SimCfnResource>;
  private readonly dependents: ReadonlyMap<string, readonly SimCfnResource[]>;

  constructor(
    resources: ReadonlyMap<string, SimCfnResource>,
    pendingResources: ReadonlySet<SimCfnResource> = new Set(resources.values()),
  ) {
    this.resources = resources;
    this.pendingResources = pendingResources;
    this.dependents = simCfnResourceDependents(resources);
  }

  /**
   * Whether the teardown loop still has Resources to consider.
   */
  get hasResources(): boolean {
    return this.pendingResources.size > 0;
  }

  /**
   * Pending Resources that nothing still standing depends on.
   *
   * A Resource is deletable once every Resource naming it has finished
   * deleting, which is the creation rule with the arrow turned round.
   */
  deletableResources(): SimCfnResource[] {
    return [...this.pendingResources].filter((resource) => {
      const dependents = this.dependents.get(resource.logicalId) ?? [];

      return dependents.every((dependent) => dependent.deleteComplete);
    });
  }

  /**
   * Return the pending-set view for the next loop iteration.
   *
   * Resources that are delete-complete are removed. Resources that failed or
   * are still waiting for their dependents remain pending, so the orchestrator
   * can either make progress in a later batch or detect that no progress is
   * possible.
   */
  incompleteResources(): SimCfnStackPendingDeletions {
    return new SimCfnStackPendingDeletions(
      this.resources,
      new Set(
        [...this.pendingResources].filter((resource) => {
          return !resource.deleteComplete;
        }),
      ),
    );
  }
}

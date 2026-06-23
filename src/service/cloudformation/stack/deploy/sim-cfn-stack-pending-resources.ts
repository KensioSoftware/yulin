import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";

/**
 * Immutable view of the Resources still pending in the Stack creation loop.
 *
 * This class owns only pending-set queries and transformations:
 *
 * - expose whether any Resources are still pending
 * - select pending Resources whose dependencies are satisfied
 * - return the next pending-set view after a batch has run
 *
 * It does not mutate Resources, create Resources, or report dependency
 * deadlocks.
 * SimCfnStackResourceCreator owns the orchestration loop and deadlock decision;
 * each SimCfnResource owns the actual can-create and create-complete checks.
 */
export class SimCfnStackPendingResources {
  private readonly resources: ReadonlyMap<string, SimCfnResource>;
  private readonly pendingResources: ReadonlySet<SimCfnResource>;

  constructor(
    resources: ReadonlyMap<string, SimCfnResource>,
    pendingResources: ReadonlySet<SimCfnResource> = new Set(resources.values()),
  ) {
    this.resources = resources;
    this.pendingResources = pendingResources;
  }

  /**
   * Whether the creation loop still has Resources to consider.
   */
  get hasResources(): boolean {
    return this.pendingResources.size > 0;
  }

  /**
   * Pending Resources whose dependencies are currently satisfied.
   *
   * Dependency checks are delegated to each SimCfnResource so dependency rules
   * remain close to Resource template interpretation.
   */
  creatableResources(): SimCfnResource[] {
    return [...this.pendingResources].filter((resource) => {
      return resource.canCreate(this.resources);
    });
  }

  /**
   * Return the pending-set view for the next loop iteration.
   *
   * Resources that are create-complete are removed. Resources that failed,
   * skipped, or are still waiting for dependencies remain pending so the
   * orchestrator can either make progress in a later batch or detect that no
   * progress is possible.
   */
  incompleteResources(): SimCfnStackPendingResources {
    return new SimCfnStackPendingResources(
      this.resources,
      new Set(
        [...this.pendingResources].filter((resource) => {
          return !resource.createComplete;
        }),
      ),
    );
  }
}

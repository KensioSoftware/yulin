import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import { SimCfnResourceRetention } from "../../resource/delete/sim-cfn-resource-retention.js";
import {
  simCfnStackResourceChanges,
  type SimCfnStackInPlaceUpdates,
} from "./sim-cfn-stack-resource-changes.js";
import {
  simCfnStackResourceChangePairs,
  type SimCfnStackResourceChange,
} from "./sim-cfn-stack-resource-change-pairs.js";

interface SimCfnStackUpdatePlanProperties {
  readonly current: ReadonlyMap<string, SimCfnResource>;
  readonly updated: ReadonlyMap<string, SimCfnResource>;
  readonly inPlaceUpdates?: SimCfnStackInPlaceUpdates | undefined;
}

/**
 * What an update has to do to a Stack's Resources, worked out before any of it
 * happens.
 *
 * The plan compares the Resources the Stack has with the ones its new template
 * describes, and says which to update where they are, which to delete, which to
 * create, and what the Stack holds afterwards. A Resource the template still
 * describes unchanged is left alone, keeping whatever it holds in simulated
 * AWS.
 *
 * It does not delete, create or update anything, order the work, or decide what
 * counts as a changed Resource. SimCfnStackUpdater runs the plan, and
 * simCfnStackResourceChanges decides what changed and how.
 */
export class SimCfnStackUpdatePlan {
  /** The current and updated halves of each Resource replacement. */
  public readonly replacements: readonly SimCfnStackResourceChange[];

  /**
   * The Resources to change where they are, rather than by replacing them.
   */
  public readonly updates: readonly SimCfnStackResourceChange[];

  /**
   * The deployed Resources to delete: the ones the new template drops, and the
   * deployed halves of the ones it replaces.
   */
  public readonly deletions: readonly SimCfnResource[];

  /**
   * The new Resources to create: the ones the new template adds, and the new
   * halves of the ones it replaces.
   */
  public readonly creations: readonly SimCfnResource[];

  public readonly updated: ReadonlyMap<string, SimCfnResource>;

  constructor(properties: SimCfnStackUpdatePlanProperties) {
    const { current, updated, inPlaceUpdates } = properties;
    const { replaced, updatedInPlace } = simCfnStackResourceChanges({
      current,
      updated,
      inPlaceUpdates,
    });

    this.updated = updated;
    this.replacements = simCfnStackResourceChangePairs(
      current,
      updated,
      replaced,
    );
    this.updates = simCfnStackResourceChangePairs(
      current,
      updated,
      updatedInPlace,
    );

    // Both lists are worked out now rather than on demand, because the Stack's
    // Resource map is the current one and applying the plan changes it.
    this.deletions = current
      .values()
      .filter((resource) => {
        return (
          !updated.has(resource.logicalId) || replaced.has(resource.logicalId)
        );
      })
      .toArray();
    this.creations = updated
      .values()
      .filter((resource) => {
        return (
          !current.has(resource.logicalId) || replaced.has(resource.logicalId)
        );
      })
      .toArray();
  }

  /**
   * What the update's deletions are to leave in simulated AWS.
   *
   * A replacement's new half answers for it, because CloudFormation reads
   * UpdateReplacePolicy off the template it is applying. An update that adds
   * the attribute keeps the Resource it replaces, and one that drops it
   * deletes that Resource.
   */
  retention(): SimCfnResourceRetention {
    return new SimCfnResourceRetention({
      replaced: new Map(
        this.replacements.map(({ current, updated }) => [
          current.logicalId,
          updated.retainedOnReplace,
        ]),
      ),
    });
  }

  /**
   * Whether the update changes any Resource at all.
   *
   * A template that only changes something else, such as an Output, still
   * updates the Stack, so this is not the whole no-op question.
   */
  public get changesResources(): boolean {
    return (
      this.deletions.length > 0 ||
      this.creations.length > 0 ||
      this.updates.length > 0
    );
  }

  /**
   * Move the Stack's Resource map on to the new template.
   *
   * The map is changed in place rather than replaced, so anything already
   * holding the Stack's Resources sees the update. A Resource the template
   * leaves alone keeps the object it already had, which is what keeps its
   * simulated AWS Resource and its creation status. A Resource updated where it
   * is takes the new record, which the update has already moved on to the
   * deployed simulated AWS Resource.
   */
  applyTo(resources: Map<string, SimCfnResource>): void {
    const dropped = resources
      .keys()
      .filter((logicalId) => !this.updated.has(logicalId))
      .toArray();

    for (const logicalId of dropped) {
      resources.delete(logicalId);
    }

    for (const resource of this.creations) {
      resources.set(resource.logicalId, resource);
    }

    for (const { updated } of this.updates) {
      resources.set(updated.logicalId, updated);
    }
  }
}

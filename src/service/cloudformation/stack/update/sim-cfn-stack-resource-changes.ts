import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import { simCfnTemplateSignature } from "./sim-cfn-template-signature.js";

/**
 * Who decides whether a change can be applied to the deployed Resource.
 * Answering false replaces the Resource.
 */
export interface SimCfnStackInPlaceUpdates {
  updatesInPlace(current: SimCfnResource, updated: SimCfnResource): boolean;
}

interface SimCfnStackResourceChangesProperties {
  readonly current: ReadonlyMap<string, SimCfnResource>;
  readonly updated: ReadonlyMap<string, SimCfnResource>;

  /**
   * Which changes the owning service can apply to the deployed Resource.
   * Omitted, every changed Resource is replaced.
   */
  readonly inPlaceUpdates?: SimCfnStackInPlaceUpdates | undefined;
}

/**
 * What an update does to each Resource a Stack and its new template share.
 */
export interface SimCfnStackResourceChanges {
  /** The logical IDs to delete and create again from the new template. */
  readonly replaced: ReadonlySet<string>;

  /** The logical IDs to change where they are. */
  readonly updatedInPlace: ReadonlySet<string>;
}

/**
 * How an update reconciles each changed Resource, given the Stack's deployed
 * Resources and the ones its new template describes.
 *
 * A Resource whose resolved template entry changed is replaced, which means
 * deleting it and creating it again from the new template. The service owning
 * the Resource can claim the change instead, for the properties real
 * CloudFormation applies with no interruption.
 *
 * A Resource that names a replaced Resource is replaced too, all the way up the
 * dependency chain. Real CloudFormation hands the dependent the new physical
 * name instead, but nothing here can rewrite an already created simulated
 * Resource, and leaving the dependent alone would leave it pointing at a
 * Resource that has gone. An in-place update keeps the Resource's physical
 * name, so it spreads to nothing.
 */
export function simCfnStackResourceChanges(
  properties: SimCfnStackResourceChangesProperties,
): SimCfnStackResourceChanges {
  const { current, updated, inPlaceUpdates } = properties;
  const changed = changedLogicalIds({ current, updated });
  const updatedInPlace = new Set(
    changed.values().filter((logicalId) => {
      const currentResource = current.get(logicalId);
      const updatedResource = updated.get(logicalId);

      return (
        currentResource !== undefined &&
        updatedResource !== undefined &&
        inPlaceUpdates?.updatesInPlace(currentResource, updatedResource) ===
          true
      );
    }),
  );

  const replaced = new Set(
    changed.values().filter((logicalId) => !updatedInPlace.has(logicalId)),
  );

  spreadToDependents({ updated, current, replaced, updatedInPlace });

  return { replaced, updatedInPlace };
}

/**
 * The logical IDs an update has to replace.
 *
 * Kept for the change set, which reports what an update would do without
 * knowing which service owns each Resource.
 */
export function simCfnStackReplacedLogicalIds(
  properties: SimCfnStackResourceChangesProperties,
): ReadonlySet<string> {
  return simCfnStackResourceChanges(properties).replaced;
}

interface SpreadToDependentsProperties {
  readonly current: ReadonlyMap<string, SimCfnResource>;
  readonly updated: ReadonlyMap<string, SimCfnResource>;
  readonly replaced: Set<string>;
  readonly updatedInPlace: ReadonlySet<string>;
}

/**
 * Replace every Resource naming a replaced one, and every Resource naming
 * those.
 */
function spreadToDependents(properties: SpreadToDependentsProperties): void {
  const { current, updated, replaced, updatedInPlace } = properties;

  // Each pass replaces the Resources naming one already being replaced, until a
  // pass finds none, which is the end of the dependency chain.
  let spreading = true;

  while (spreading) {
    spreading = false;

    for (const [logicalId, resource] of updated) {
      const spreads =
        current.has(logicalId) &&
        !replaced.has(logicalId) &&
        !updatedInPlace.has(logicalId) &&
        resource.dependencies().some((dependency) => replaced.has(dependency));

      if (spreads) {
        replaced.add(logicalId);
        spreading = true;
      }
    }
  }
}

/**
 * The logical IDs whose resolved template entry differs from the deployed one.
 */
function changedLogicalIds(
  properties: SimCfnStackResourceChangesProperties,
): ReadonlySet<string> {
  const { current, updated } = properties;
  const changed = new Set<string>();

  for (const [logicalId, resource] of updated) {
    const deployed = current.get(logicalId);

    if (
      deployed !== undefined &&
      simCfnTemplateSignature(deployed.template) !==
        simCfnTemplateSignature(resource.template)
    ) {
      changed.add(logicalId);
    }
  }

  return changed;
}

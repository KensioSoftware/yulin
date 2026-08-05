import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import { simCfnTemplateSignature } from "./sim-cfn-template-signature.js";

interface SimCfnStackReplacedResourcesProperties {
  readonly current: ReadonlyMap<string, SimCfnResource>;
  readonly updated: ReadonlyMap<string, SimCfnResource>;
}

/**
 * The logical IDs an update has to replace, given the Stack's deployed
 * Resources and the ones its new template describes.
 *
 * A Resource is replaced when its resolved template entry changed. Sim
 * CloudFormation has no in-place update, so replacement means deleting the
 * Resource and creating it again from the new template.
 *
 * A Resource that names a replaced Resource is replaced too, all the way up the
 * dependency chain. Real CloudFormation hands the dependent the new physical
 * name instead, but nothing here can rewrite an already created simulated
 * Resource, and leaving the dependent alone would leave it pointing at a
 * Resource that has gone.
 */
export function simCfnStackReplacedLogicalIds(
  properties: SimCfnStackReplacedResourcesProperties,
): ReadonlySet<string> {
  const { current, updated } = properties;
  const replaced = changedLogicalIds({ current, updated });

  // Each pass replaces the Resources naming one already being replaced, until a
  // pass finds none, which is the end of the dependency chain.
  let spreading = true;

  while (spreading) {
    spreading = false;

    for (const [logicalId, resource] of updated) {
      const spreads =
        current.has(logicalId) &&
        !replaced.has(logicalId) &&
        resource.dependencies().some((dependency) => replaced.has(dependency));

      if (spreads) {
        replaced.add(logicalId);
        spreading = true;
      }
    }
  }

  return replaced;
}

/**
 * The logical IDs whose resolved template entry differs from the deployed one.
 */
function changedLogicalIds(
  properties: SimCfnStackReplacedResourcesProperties,
): Set<string> {
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

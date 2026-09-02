import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimCfnResource } from "../resource/sim-cfn-resource.js";
import type { SimCfnStack } from "../stack/sim-cfn-stack.js";
import { makeSimCfnStackResourceMap } from "../stack/resource-map/sim-cfn-stack-resource-map.js";
import { simCfnStackReplacedLogicalIds } from "../stack/update/sim-cfn-stack-replaced-resources.js";
import type { SimCfnTemplate } from "../template/sim-cfn-template.js";
import type {
  SimCfnChangeSetType,
  SimCfnResourceChange,
} from "./sim-cfn-change-set.type.js";

interface SimCfnChangeSetPlanProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
  readonly stack: SimCfnStack;
  readonly type: SimCfnChangeSetType;
  readonly template: SimCfnTemplate;
}

/**
 * What executing a change set would do to the Stack it is held against.
 *
 * A `CREATE` change set is compared against nothing, because the Stack it
 * brought into being holds no created Resource yet.
 */
export function simCfnChangeSetPlan(
  properties: SimCfnChangeSetPlanProperties,
): readonly SimCfnResourceChange[] {
  const { accountRegionScope, background, stack, type, template } = properties;

  return simCfnChangeSetChanges({
    current: type === "CREATE" ? new Map() : stack.resourceMap,
    updated: makeSimCfnStackResourceMap({
      accountRegionScope,
      background,
      template,
    }),
  });
}

interface SimCfnChangeSetChangesProperties {
  /** The Resources the Stack holds now. Empty for a Stack in review. */
  readonly current: ReadonlyMap<string, SimCfnResource>;

  /** The Resources the change set's template describes. */
  readonly updated: ReadonlyMap<string, SimCfnResource>;
}

/**
 * What executing a change set would do to a Stack's Resources.
 *
 * The same comparison an update makes, reported rather than applied. A
 * Resource only the new template has is an `Add`, one only the Stack has is a
 * `Remove`, and one both have whose resolved template entry changed is a
 * `Modify`. A Resource that would be replaced because it names a replaced one
 * is a `Modify` too, which is how CloudFormation reports a dependent it has to
 * hand a new physical name to.
 *
 * The order follows the templates. The new template's Resources come first, in
 * the order it declares them, and the dropped ones after in the order the Stack
 * holds them.
 */
export function simCfnChangeSetChanges(
  properties: SimCfnChangeSetChangesProperties,
): readonly SimCfnResourceChange[] {
  const { current, updated } = properties;
  const replaced = simCfnStackReplacedLogicalIds({ current, updated });

  const changed = updated
    .values()
    .filter((resource) => !unchanged(resource, current, replaced))
    .map((resource) => ({
      action: current.has(resource.logicalId)
        ? ("Modify" as const)
        : ("Add" as const),
      logicalResourceId: resource.logicalId,
      resourceType: resource.type,
      replacement: current.has(resource.logicalId)
        ? ("True" as const)
        : undefined,
    }))
    .toArray();

  const removed = current
    .values()
    .filter((resource) => !updated.has(resource.logicalId))
    .map((resource) => ({
      action: "Remove" as const,
      logicalResourceId: resource.logicalId,
      resourceType: resource.type,
      replacement: undefined,
    }))
    .toArray();

  return [...changed, ...removed];
}

/**
 * Whether the Stack already holds this Resource as the new template describes
 * it, which is a Resource the change set leaves out.
 */
function unchanged(
  resource: SimCfnResource,
  current: ReadonlyMap<string, SimCfnResource>,
  replaced: ReadonlySet<string>,
): boolean {
  return current.has(resource.logicalId) && !replaced.has(resource.logicalId);
}

import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import type { SimCfnTemplate } from "../../template/sim-cfn-template.js";
import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";
import type { SimCfnStackResourceOperations } from "../sim-cfn-stack-resource-operations.js";
import { makeSimCfnStackResourceMap } from "../resource-map/sim-cfn-stack-resource-map.js";
import { SimCfnStackUpdatePlan } from "./sim-cfn-stack-update-plan.js";
import { simCfnStackTemplateChanged } from "./sim-cfn-stack-template-changes.js";

/**
 * What CloudFormation answers an update that would change nothing.
 *
 * Named because a template file being watched is written far more often than it
 * is changed, so telling this apart from a real failure is what makes a save
 * with nothing in it a no-op rather than something to report.
 */
export const simCfnNoUpdatesMessage = "No updates are to be performed.";

interface SimCfnStackUpdaterProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
  readonly resources: Map<string, SimCfnResource>;
  readonly operations: SimCfnStackResourceOperations;
  readonly current: SimCfnTemplate;
  readonly updated: SimCfnTemplate;
}

/**
 * Applies a changed template to a Stack that is already deployed.
 *
 * The Resources the new template drops or replaces go first, in the reverse of
 * the order they were created in, and the ones it adds or replaces are created
 * after, in dependency order. Everything else is left where it is, which is the
 * point of updating a Stack rather than replacing it: what a Bucket holds and
 * what a Table has in it survive a change elsewhere in the template.
 *
 * It does not own Stack status or the Stack's visible template.
 * SimCfnStackUpdateLifecycle owns the first and SimCfnStack the second.
 */
export class SimCfnStackUpdater {
  private readonly properties: SimCfnStackUpdaterProperties;
  private readonly plan: SimCfnStackUpdatePlan;

  constructor(properties: SimCfnStackUpdaterProperties) {
    const { accountRegionScope, background, resources, updated } = properties;

    this.properties = properties;
    this.plan = new SimCfnStackUpdatePlan({
      current: resources,
      updated: makeSimCfnStackResourceMap({
        accountRegionScope,
        background,
        template: updated,
      }),
    });
  }

  /**
   * Refuse an update that would do nothing, the way CloudFormation refuses one.
   *
   * Everything else in the template counts as well as the Resources: a
   * template that only changes an Output or a Description still updates the
   * Stack.
   */
  assertHasChanges(): void {
    const { current, updated } = this.properties;

    if (
      !this.plan.changesResources &&
      !simCfnStackTemplateChanged(current, updated)
    ) {
      throw new SimCloudFormationValidationError(simCfnNoUpdatesMessage);
    }
  }

  /**
   * Reconcile the Stack's Resources with its new template.
   */
  async apply(): Promise<void> {
    const { resources, operations } = this.properties;
    const { plan } = this;

    await operations.delete(resources, plan.deletions);

    plan.applyTo(resources);

    await operations.create(resources, plan.creations);
  }
}

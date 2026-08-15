import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimElbV2 } from "../../sim-elbv2.js";
import type { SimElbV2Stores } from "../../sim-elbv2-stores.js";
import type { SimElbV2TargetGroup } from "../../target-group/sim-elbv2-target-group.js";
import type { SimElbV2TargetDescription } from "../../target-group/sim-elbv2-target.js";
import { SimCfnElbV2TargetGroupProperties } from "./sim-cfn-elbv2-target-group-properties.js";

interface SimCfnElbV2TargetGroupCreatorProperties {
  readonly elbV2: SimElbV2;
  readonly stores: SimElbV2Stores;
}

/**
 * Creates simulated target groups from
 * AWS::ElasticLoadBalancingV2::TargetGroup Resources.
 *
 * A declared `Targets` list is registered as part of creating the group, which
 * is what real CloudFormation does, so a stack declaring a Lambda target has a
 * group that routes as soon as it has deployed rather than one waiting for a
 * RegisterTargets call the stack never makes.
 */
export class SimCfnElbV2TargetGroupCreator {
  private readonly elbV2: SimElbV2;
  private readonly stores: SimElbV2Stores;

  constructor(properties: SimCfnElbV2TargetGroupCreatorProperties) {
    this.elbV2 = properties.elbV2;
    this.stores = properties.stores;
  }

  /**
   * Create a target group from a TargetGroup Resource.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
  ): Promise<SimElbV2TargetGroup> {
    const declared = new SimCfnElbV2TargetGroupProperties({
      resource,
      properties,
    });
    const input = declared.createTargetGroupInput();

    declared.recordIgnoredProperties();

    await this.elbV2.createTargetGroup({ input });

    const targetGroup = this.stores.targetGroups.requireByName(declared.name());

    await this.registerTargets(targetGroup, declared.targets());

    return targetGroup;
  }

  /**
   * Delete a target group created from a TargetGroup Resource.
   *
   * DeleteTargetGroup refuses a group a listener or rule still forwards to, so
   * a group comes down after the listeners naming it, which the teardown order
   * arranges.
   */
  async delete(targetGroup: SimElbV2TargetGroup): Promise<void> {
    await this.elbV2.deleteTargetGroup({
      input: { TargetGroupArn: targetGroup.arn },
    });
  }

  /**
   * Register the targets the Resource declared, if it declared any.
   */
  private async registerTargets(
    targetGroup: SimElbV2TargetGroup,
    targets: readonly SimElbV2TargetDescription[] | undefined,
  ): Promise<void> {
    if (targets === undefined || targets.length === 0) {
      return;
    }

    await this.elbV2.registerTargets({
      input: { TargetGroupArn: targetGroup.arn, Targets: targets },
    });
  }
}

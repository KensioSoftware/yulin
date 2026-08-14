import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import type { SimElbV2Stores } from "../../sim-elbv2-stores.js";
import type { SimElbV2TargetGroup } from "../../target-group/sim-elbv2-target-group.js";
import type { SimElbV2TargetGroupUsage } from "../../target-group/sim-elbv2-target-group-usage.js";
import type { SimDescribeTargetGroupsCommandInput } from "./target-group.command.js";

interface SimElbV2TargetGroupSelectionProperties {
  readonly stores: SimElbV2Stores;
  readonly usage: SimElbV2TargetGroupUsage;
}

/**
 * Which target groups a describe named.
 *
 * Real ELB takes three ways of naming them and one way at a time, since two
 * could disagree, so reading the request and resolving what it named are the
 * same job and are held together here rather than split across the handler.
 */
export class SimElbV2TargetGroupSelection {
  private readonly stores: SimElbV2Stores;
  private readonly usage: SimElbV2TargetGroupUsage;

  constructor(properties: SimElbV2TargetGroupSelectionProperties) {
    this.stores = properties.stores;
    this.usage = properties.usage;
  }

  /**
   * Refuse a request naming target groups more than one way.
   *
   * This is separate from resolving them so that it can run before the request
   * is authorized, as it does on real ELB.
   */
  validate(input: SimDescribeTargetGroupsCommandInput): void {
    const named = [
      input.TargetGroupArns,
      input.Names,
      input.LoadBalancerArn,
    ].filter((selector) => selector !== undefined);

    if (named.length > 1) {
      throw new SimElbV2ValidationError(
        "DescribeTargetGroups takes one of TargetGroupArns, Names or " +
          "LoadBalancerArn",
      );
    }
  }

  /**
   * The target groups a request named, or all of them.
   */
  resolve(
    input: SimDescribeTargetGroupsCommandInput,
  ): readonly SimElbV2TargetGroup[] {
    if (input.TargetGroupArns !== undefined) {
      return input.TargetGroupArns.map((arn) =>
        this.stores.targetGroups.requireByArn(arn),
      );
    }

    if (input.Names !== undefined) {
      return input.Names.map((name) =>
        this.stores.targetGroups.requireByName(name),
      );
    }

    if (input.LoadBalancerArn === undefined) {
      return this.stores.targetGroups.all;
    }

    const loadBalancer = this.stores.loadBalancers.requireByArn(
      input.LoadBalancerArn,
    );

    return this.stores.targetGroups.all.filter((targetGroup) =>
      this.usage.loadBalancerArns(targetGroup).includes(loadBalancer.arn),
    );
  }
}

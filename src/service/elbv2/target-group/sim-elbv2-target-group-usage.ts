import { SimElbV2ResourceInUseException } from "../error/sim-elbv2.error.js";
import type { SimElbV2Stores } from "../sim-elbv2-stores.js";
import type { SimElbV2TargetGroup } from "./sim-elbv2-target-group.js";

/**
 * Which load balancers forward to a target group.
 *
 * Nothing records this on the target group, because a group learns it is being
 * forwarded to only through a listener or a rule naming it, and a rule can be
 * written and deleted without the group hearing about it. Reading it back out
 * of the listeners and rules is therefore the only answer that cannot go
 * stale.
 */
export class SimElbV2TargetGroupUsage {
  private readonly stores: SimElbV2Stores;

  constructor(stores: SimElbV2Stores) {
    this.stores = stores;
  }

  /**
   * The load balancers whose listeners or rules forward to a target group.
   */
  loadBalancerArns(targetGroup: SimElbV2TargetGroup): readonly string[] {
    const fromListeners = this.stores.listeners.all
      .filter((listener) =>
        listener.defaultActions.some((action) =>
          action.targetGroupArns.includes(targetGroup.arn),
        ),
      )
      .map((listener) => listener.loadBalancerArn);

    const fromRules = this.stores.rules.all
      .filter((rule) =>
        rule.actions.some((action) =>
          action.targetGroupArns.includes(targetGroup.arn),
        ),
      )
      .map(
        (rule) =>
          this.stores.listeners.requireByArn(rule.listenerArn).loadBalancerArn,
      );

    return [...new Set([...fromListeners, ...fromRules])];
  }

  /**
   * Refuse to delete a target group anything still forwards to.
   */
  requireUnused(targetGroup: SimElbV2TargetGroup): void {
    const inUseBy = this.loadBalancerArns(targetGroup);

    if (inUseBy.length > 0) {
      throw new SimElbV2ResourceInUseException(
        `Target group ${targetGroup.arn} is still forwarded to by ${inUseBy.join(", ")}`,
      );
    }
  }
}

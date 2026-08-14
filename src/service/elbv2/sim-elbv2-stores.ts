import { SimElbV2ListenerStore } from "./listener/sim-elbv2-listener-store.js";
import { SimElbV2ListenerRuleStore } from "./listener/rule/sim-elbv2-listener-rule-store.js";
import { SimElbV2LoadBalancerStore } from "./load-balancer/sim-elbv2-load-balancer-store.js";
import type { SimElbV2LoadBalancer } from "./load-balancer/sim-elbv2-load-balancer.js";
import type { SimElbV2Listener } from "./listener/sim-elbv2-listener.js";
import { SimElbV2TargetGroupStore } from "./target-group/sim-elbv2-target-group-store.js";

/**
 * Everything one simulated ELBv2 scope holds.
 *
 * The four resources are kept in four stores rather than nested inside each
 * other, because the SDK addresses each of them by its own ARN and a describe
 * has no parent to start from. What they do have is a lifetime that runs one
 * way, and that is the part this class owns: deleting a load balancer takes
 * its listeners, and deleting a listener takes its rules.
 */
export class SimElbV2Stores {
  public readonly loadBalancers = new SimElbV2LoadBalancerStore();
  public readonly targetGroups = new SimElbV2TargetGroupStore();
  public readonly listeners = new SimElbV2ListenerStore();
  public readonly rules = new SimElbV2ListenerRuleStore();

  /**
   * Delete a load balancer, and everything that only existed on it.
   *
   * Target groups are left where they are, which is what real ELB does: a
   * target group is a resource in its own right, and a stack that replaces a
   * load balancer keeps the groups its new listeners will forward to.
   */
  deleteLoadBalancer(loadBalancer: SimElbV2LoadBalancer): void {
    for (const listener of this.listeners.forLoadBalancer(loadBalancer.arn)) {
      this.deleteListener(listener);
    }

    this.loadBalancers.remove(loadBalancer);
  }

  /**
   * Delete a listener, and the rules that only existed on it.
   */
  deleteListener(listener: SimElbV2Listener): void {
    for (const rule of this.rules.forListener(listener.arn)) {
      this.rules.remove(rule);
    }

    this.listeners.remove(listener);
  }
}

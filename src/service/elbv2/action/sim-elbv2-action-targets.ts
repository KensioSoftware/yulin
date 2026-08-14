import type { SimElbV2TargetGroupStore } from "../target-group/sim-elbv2-target-group-store.js";
import type { SimElbV2Action } from "./sim-elbv2-action.js";

/**
 * Checks that the target groups a set of actions forwards to exist.
 *
 * A forward action naming a target group that was never created is the one
 * mistake in a listener or a rule that nothing else would catch until a
 * request arrived and went nowhere, so it is caught when the action is written
 * instead. Real ELB does the same.
 */
export class SimElbV2ActionTargets {
  private readonly targetGroups: SimElbV2TargetGroupStore;

  constructor(targetGroups: SimElbV2TargetGroupStore) {
    this.targetGroups = targetGroups;
  }

  /**
   * Refuse actions forwarding to a target group that does not exist.
   */
  requireTargetGroups(actions: readonly SimElbV2Action[]): void {
    for (const action of actions) {
      for (const arn of action.targetGroupArns) {
        this.targetGroups.requireByArn(arn);
      }
    }
  }
}

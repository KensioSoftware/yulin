import {
  SimElbV2DuplicateTargetGroupNameException,
  SimElbV2TargetGroupNotFoundException,
} from "../error/sim-elbv2.error.js";
import type { SimElbV2TargetGroup } from "./sim-elbv2-target-group.js";

/**
 * The target groups of one simulated ELBv2 scope.
 *
 * Target groups outlive the load balancers that forward to them, which is why
 * they are held here rather than under a load balancer: deleting a load
 * balancer takes its listeners and rules with it and leaves these alone, as
 * real ELB does.
 */
export class SimElbV2TargetGroupStore {
  private readonly targetGroups = new Map<string, SimElbV2TargetGroup>();
  private sequence = 0;

  /**
   * Every target group in this scope, in creation order.
   */
  get all(): readonly SimElbV2TargetGroup[] {
    return this.targetGroups.values().toArray();
  }

  /**
   * Take the next id for a target group about to be created.
   */
  nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  /**
   * Refuse a name another target group in this scope already holds.
   */
  requireNameAvailable(name: string): void {
    if (this.findByName(name) !== undefined) {
      throw new SimElbV2DuplicateTargetGroupNameException(
        `A target group named '${name}' already exists in this account and ` +
          `region`,
      );
    }
  }

  /**
   * Store a created target group.
   */
  put(targetGroup: SimElbV2TargetGroup): void {
    this.targetGroups.set(targetGroup.arn, targetGroup);
  }

  /**
   * Find a target group by name.
   */
  findByName(name: string): SimElbV2TargetGroup | undefined {
    return this.all.find((targetGroup) => targetGroup.name === name);
  }

  /**
   * Resolve a target group by ARN, or refuse.
   */
  requireByArn(arn: string): SimElbV2TargetGroup {
    const found = this.targetGroups.get(arn);

    if (found === undefined) {
      throw new SimElbV2TargetGroupNotFoundException(
        `No sim ELBv2 target group with ARN ${arn}`,
      );
    }

    return found;
  }

  /**
   * Resolve a target group by name, or refuse.
   */
  requireByName(name: string): SimElbV2TargetGroup {
    const found = this.findByName(name);

    if (found === undefined) {
      throw new SimElbV2TargetGroupNotFoundException(
        `No sim ELBv2 target group named ${name}`,
      );
    }

    return found;
  }

  /**
   * Forget a deleted target group.
   */
  remove(targetGroup: SimElbV2TargetGroup): void {
    this.targetGroups.delete(targetGroup.arn);
  }
}

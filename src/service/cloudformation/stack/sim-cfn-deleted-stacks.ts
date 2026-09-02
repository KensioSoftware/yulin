import type { SimCfnStack } from "./sim-cfn-stack.js";
import type { SimCfnStackId } from "./sim-cfn-stack-id.js";

/**
 * The Stacks that have finished deleting, kept by Stack ID.
 *
 * A deleted Stack gives its name back, so the map of live Stacks can no longer
 * hold it: the next Stack of that name is a different Stack. CloudFormation
 * still answers `DescribeStacks` for it by its Stack ID, for 90 days, and this
 * is where the Stack it answers with is kept.
 *
 * Nothing expires here. A simulation lasts a test rather than three months, so
 * a deleted Stack stays readable for as long as the simulated CloudFormation
 * it was deleted from does.
 */
export class SimCfnDeletedStacks {
  private readonly stacks = new Map<SimCfnStackId, SimCfnStack>();

  /** Keep a Stack that has finished deleting, so its ID still describes it. */
  record(stack: SimCfnStack): void {
    this.stacks.set(stack.stackId, stack);
  }

  /** The deleted Stack with this Stack ID, if one was deleted under it. */
  get(stackId: string): SimCfnStack | undefined {
    return this.stacks.get(stackId as SimCfnStackId);
  }
}

import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "../../stack/sim-cfn-stack.js";
import type { SimCfnDeletedStacks } from "../../stack/sim-cfn-deleted-stacks.js";
import { isSimCfnStackId } from "../../stack/sim-cfn-stack-id.js";
import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";

interface SimCfnDescribedStacksProperties {
  readonly stacks: ReadonlyMap<SimCloudFormationStackName, SimCfnStack>;
  readonly deleted: SimCfnDeletedStacks;
}

/**
 * Chooses which Stacks a DescribeStacks request is about.
 *
 * A request either names one Stack or asks for all of them, and the two are
 * answered differently when nothing matches: an unnamed request over an empty
 * Stack map is an empty list, while a named request is a refusal.
 *
 * Turning a Stack into its description belongs to SimCfnStackDescriber, and
 * request handling to the command handler.
 */
export class SimCfnDescribedStacks {
  private readonly stacks: ReadonlyMap<SimCloudFormationStackName, SimCfnStack>;
  private readonly deleted: SimCfnDeletedStacks;

  constructor(properties: SimCfnDescribedStacksProperties) {
    this.stacks = properties.stacks;
    this.deleted = properties.deleted;
  }

  /**
   * The Stacks to describe for a request naming this Stack, or all of them if
   * it names none.
   *
   * `StackName` carries either a Stack name or a Stack ID, as it does in
   * CloudFormation, and a Stack ID reaches a deleted Stack as well as a live
   * one. A deleted Stack's name does not: the name is back in circulation, and
   * is refused the same way as a name that never existed.
   *
   * An unnamed request answers with the live Stacks alone. CloudFormation
   * leaves deleted Stacks out of it too.
   */
  matching(stackName: string | undefined): SimCfnStack[] {
    if (stackName === undefined) {
      return this.stacks.values().toArray();
    }

    const stack = this.find(stackName);

    if (stack === undefined) {
      throw new SimCloudFormationValidationError(
        `Stack with id ${stackName} does not exist`,
      );
    }

    return [stack];
  }

  private find(stackName: string): SimCfnStack | undefined {
    if (isSimCfnStackId(stackName)) {
      return this.withStackId(stackName) ?? this.deleted.get(stackName);
    }

    return this.stacks.get(stackName as SimCloudFormationStackName);
  }

  private withStackId(stackId: string): SimCfnStack | undefined {
    return this.stacks.values().find((stack) => stack.stackId === stackId);
  }
}

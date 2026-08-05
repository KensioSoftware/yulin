import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "../../stack/sim-cfn-stack.js";
import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";

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
  constructor(
    private readonly stacks: ReadonlyMap<
      SimCloudFormationStackName,
      SimCfnStack
    >,
  ) {}

  /**
   * The Stacks to describe for a request naming this Stack, or all of them if
   * it names none.
   *
   * A named Stack that is not there is refused with the ValidationError
   * CloudFormation answers with. A deleted Stack name reaches this too:
   * CloudFormation only describes a deleted Stack by its unique Stack ID, and
   * answers its name the same way as a name that never existed.
   */
  matching(stackName: SimCloudFormationStackName | undefined): SimCfnStack[] {
    if (stackName === undefined) {
      return this.stacks.values().toArray();
    }

    const stack = this.stacks.get(stackName);

    if (stack === undefined) {
      throw new SimCloudFormationValidationError(
        `Stack with id ${stackName} does not exist`,
      );
    }

    return [stack];
  }
}

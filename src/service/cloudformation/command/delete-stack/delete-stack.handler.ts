import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../../util/background/background.js";
import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "../../stack/sim-cfn-stack.js";
import type {
  SimDeleteStackCommand,
  SimDeleteStackCommandOutput,
} from "./delete-stack.command.js";

interface DeleteStackCommandHandlerProperties {
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly background: BackgroundScheduler & BackgroundCompleter;
}

/**
 * Simulated CloudFormation DeleteStackCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/DeleteStackCommand/
 */
export class DeleteStackCommandHandler implements CommandHandler<
  SimDeleteStackCommand,
  SimDeleteStackCommandOutput
> {
  private readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  private readonly background: BackgroundScheduler & BackgroundCompleter;

  constructor(properties: DeleteStackCommandHandlerProperties) {
    this.stacks = properties.stacks;
    this.background = properties.background;
  }

  /**
   * Start deleting a simulated CloudFormation Stack.
   *
   * A Stack name that is not there is a success rather than an error, as it is
   * in CloudFormation: DeleteStack says the Stack should be gone, and a Stack
   * that has already gone satisfies that. Only DescribeStacks refuses a name it
   * cannot find.
   *
   * The call returns once deletion has started. The Resources are deleted in
   * the background, and the Stack name is only released when that finishes, so
   * a CreateStack that reuses the name should follow a wait for deletion to
   * complete.
   */
  async handle(
    command: SimDeleteStackCommand,
  ): Promise<SimDeleteStackCommandOutput> {
    assertDefined(
      command.input.StackName,
      "DeleteStackCommand.input.StackName",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const stackName = command.input.StackName as SimCloudFormationStackName;
    const stack = this.stacks.get(stackName);

    await stack?.delete({
      onDeleteComplete: (): void => {
        this.stacks.delete(stackName);
      },
    });

    return { $metadata: {} };
  }
}

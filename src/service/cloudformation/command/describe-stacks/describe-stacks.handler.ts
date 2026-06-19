import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../../../util/background/background.js";
import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "../../stack/sim-cfn-stack.js";
import type {
  SimCloudFormationStackDescription,
  SimDescribeStacksCommand,
  SimDescribeStacksCommandOutput,
} from "./describe-stacks.cmd.js";

interface DescribeStacksCommandHandlerProps {
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated CloudFormation DescribeStacksCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/DescribeStacksCommand/
 */
export class DescribeStacksCommandHandler implements CommandHandler<
  SimDescribeStacksCommand,
  SimDescribeStacksCommandOutput
> {
  private readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  private readonly background: BackgroundScheduler;

  constructor(props: DescribeStacksCommandHandlerProps) {
    const { stacks, background = new BackgroundTasks() } = props;

    this.stacks = stacks;
    this.background = background;
  }

  /**
   * Describe simulated CloudFormation Stacks.
   */
  async handle(
    cmd: SimDescribeStacksCommand,
  ): Promise<SimDescribeStacksCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const stackName = cmd.input.StackName as
      | SimCloudFormationStackName
      | undefined;

    if (stackName !== undefined) {
      const stack = this.stacks.get(stackName);

      return {
        Stacks: stack === undefined ? [] : [this.describeStack(stack)],
        $metadata: {},
      };
    }

    return {
      Stacks: [...this.stacks.values()].map((stack) =>
        this.describeStack(stack),
      ),
      $metadata: {},
    };
  }

  private describeStack(stack: SimCfnStack): SimCloudFormationStackDescription {
    return {
      StackId: stack.stackName,
      StackName: stack.stackName,
      StackStatus: stack.lifecycle.status,
      StackStatusReason: stack.lifecycle.error?.message,
    };
  }
}

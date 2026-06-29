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
  SimDescribeStacksCommand,
  SimDescribeStacksCommandOutput,
} from "./describe-stacks.cmd.js";
import { SimCfnStackDescriber } from "./sim-cfn-stack-describer.js";

interface DescribeStacksCommandHandlerProps {
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly background?: BackgroundScheduler;
  readonly describer?: SimCfnStackDescriber;
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
  private readonly describer: SimCfnStackDescriber;

  constructor(props: DescribeStacksCommandHandlerProps) {
    const {
      stacks,
      background = new BackgroundTasks(),
      describer = new SimCfnStackDescriber(),
    } = props;

    this.stacks = stacks;
    this.background = background;
    this.describer = describer;
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
      SimCloudFormationStackName | undefined;

    if (stackName !== undefined) {
      const stack = this.stacks.get(stackName);

      return {
        Stacks: stack === undefined ? [] : [this.describer.describe(stack)],
        $metadata: {},
      };
    }

    return {
      Stacks: [...this.stacks.values()].map((stack) =>
        this.describer.describe(stack),
      ),
      $metadata: {},
    };
  }
}

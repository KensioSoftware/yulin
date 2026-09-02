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
} from "./describe-stacks.command.js";
import type { SimCfnDeletedStacks } from "../../stack/sim-cfn-deleted-stacks.js";
import { SimCfnStackDescriber } from "./sim-cfn-stack-describer.js";
import { SimCfnDescribedStacks } from "./sim-cfn-described-stacks.js";

interface DescribeStacksCommandHandlerProperties {
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly deleted: SimCfnDeletedStacks;
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
  private readonly deleted: SimCfnDeletedStacks;
  private readonly background: BackgroundScheduler;
  private readonly describer: SimCfnStackDescriber;

  constructor(properties: DescribeStacksCommandHandlerProperties) {
    const {
      stacks,
      deleted,
      background = new BackgroundTasks(),
      describer = new SimCfnStackDescriber(),
    } = properties;

    this.stacks = stacks;
    this.deleted = deleted;
    this.background = background;
    this.describer = describer;
  }

  /**
   * Describe simulated CloudFormation Stacks.
   */
  async handle(
    command: SimDescribeStacksCommand,
  ): Promise<SimDescribeStacksCommandOutput> {
    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    return {
      Stacks: new SimCfnDescribedStacks({
        stacks: this.stacks,
        deleted: this.deleted,
      })
        .matching(command.input.StackName)
        .map((stack) => this.describer.describe(stack)),
      $metadata: {},
    };
  }
}

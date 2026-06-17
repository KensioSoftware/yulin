import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/defined/defined.js";
import type {
  BackgroundScheduler,
  BackgroundCompleter,
} from "../../../../util/background/background.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import {
  SimCloudFormationStack,
  type SimCloudFormationStackName,
  type SimCloudFormationTemplate,
} from "../../stack/sim-cloudformation-stack.js";
import type {
  SimCreateStackCommand,
  SimCreateStackCommandOutput,
} from "./create-stack.cmd.js";

interface CreateStackCommandHandlerProps {
  readonly simAws: SimAws;
  readonly stacks: Map<SimCloudFormationStackName, SimCloudFormationStack>;
  readonly background: BackgroundScheduler & BackgroundCompleter;
}

/**
 * Simulated CloudFormation CreateStackCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/CreateStackCommand/
 */
export class CreateStackCommandHandler implements CommandHandler<
  SimCreateStackCommand,
  SimCreateStackCommandOutput
> {
  private readonly simAws: SimAws;
  private readonly stacks: Map<
    SimCloudFormationStackName,
    SimCloudFormationStack
  >;
  private readonly background: BackgroundScheduler & BackgroundCompleter;

  constructor(props: CreateStackCommandHandlerProps) {
    const { simAws, stacks, background } = props;

    this.simAws = simAws;
    this.stacks = stacks;
    this.background = background;
  }

  /**
   * Create a simulated CloudFormation Stack.
   */
  async handle(
    cmd: SimCreateStackCommand,
  ): Promise<SimCreateStackCommandOutput> {
    assertDefined(cmd.input.StackName, "CreateStackCommand.input.StackName");
    assertDefined(
      cmd.input.TemplateBody,
      "CreateStackCommand.input.TemplateBody",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const stackName = cmd.input.StackName as SimCloudFormationStackName;
    const template = CreateStackCommandHandler.parseTemplateBody(
      cmd.input.TemplateBody,
    );

    const stack = new SimCloudFormationStack({
      simAws: this.simAws,
      background: this.background,
      stackName,
      template,
    });

    this.stacks.set(stack.stackName, stack);

    await stack.deploy();

    return {
      StackId: stack.stackName,
      $metadata: {},
    };
  }

  private static parseTemplateBody(
    templateBody: string,
  ): SimCloudFormationTemplate {
    return JSON.parse(templateBody) as SimCloudFormationTemplate;
  }
}

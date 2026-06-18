import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/defined/defined.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../../util/background/background.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimCfnStack,
  type SimCloudFormationStackName,
} from "../../stack/sim-cfn-stack.js";
import { SimCloudFormationAlreadyExistsException } from "../../error/sim-cloudfront.error.js";
import type {
  SimCreateStackCommand,
  SimCreateStackCommandOutput,
} from "./create-stack.cmd.js";
import { SimCfnTemplate } from "../../template/sim-cfn-template.js";
import { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";

interface CreateStackCommandHandlerProps {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
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
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  private readonly background: BackgroundScheduler & BackgroundCompleter;

  constructor(props: CreateStackCommandHandlerProps) {
    const { simAws, accountRegionScope, stacks, background } = props;

    this.simAws = simAws;
    this.accountRegionScope = accountRegionScope;
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
    if (this.stacks.has(stackName)) {
      throw new SimCloudFormationAlreadyExistsException(
        `Stack [${stackName}] already exists`,
      );
    }

    const template = SimCfnTemplate.fromJson(cmd.input.TemplateBody, {
      stackName,
      parameters: SimCfnParameters.fromInput(cmd.input, {
        stackName,
      }),
    });

    const stack = new SimCfnStack({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
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
}

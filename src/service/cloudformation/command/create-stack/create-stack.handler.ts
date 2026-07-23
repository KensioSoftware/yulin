import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
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
import {
  type CfnTemplateBodyRecord,
  SimCfnTemplate,
} from "../../template/sim-cfn-template.js";
import { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import type { JSONString } from "../../../../util/type-guard/json.js";
import type { SimCdkOutContext } from "../../cdk/sim-cdk-out-context.js";
import type { SimCfnExecutableResourceBinding } from "../../bind/sim-cfn-exec-binding.type.js";

interface CreateStackCommandHandlerProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly background: BackgroundScheduler & BackgroundCompleter;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly bindings?: readonly SimCfnExecutableResourceBinding[] | undefined;
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
  private readonly cdkOutContext: SimCdkOutContext | undefined;
  private readonly bindings:
    readonly SimCfnExecutableResourceBinding[] | undefined;

  constructor(properties: CreateStackCommandHandlerProperties) {
    const {
      simAws,
      accountRegionScope,
      stacks,
      background,
      cdkOutContext,
      bindings,
    } = properties;

    this.simAws = simAws;
    this.accountRegionScope = accountRegionScope;
    this.stacks = stacks;
    this.background = background;
    this.cdkOutContext = cdkOutContext;
    this.bindings = bindings;
  }

  /**
   * Create a simulated CloudFormation Stack.
   */
  async handle(
    command: SimCreateStackCommand,
  ): Promise<SimCreateStackCommandOutput> {
    assertDefined(
      command.input.StackName,
      "CreateStackCommand.input.StackName",
    );
    assertDefined(
      command.input.TemplateBody,
      "CreateStackCommand.input.TemplateBody",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const stackName = command.input.StackName as SimCloudFormationStackName;
    if (this.stacks.has(stackName)) {
      throw new SimCloudFormationAlreadyExistsException(
        `Stack [${stackName}] already exists`,
      );
    }

    const template = SimCfnTemplate.fromJson(
      command.input.TemplateBody as JSONString<CfnTemplateBodyRecord>,
      {
        stackName,
        parameters: SimCfnParameters.fromInput(command.input, {
          stackName,
        }),
        accountRegionScope: this.accountRegionScope,
      },
    );

    const stack = new SimCfnStack({
      simAws: this.simAws,
      accountRegionScope: this.accountRegionScope,
      background: this.background,
      stackName,
      template,
      cdkOutContext: this.cdkOutContext,
      bindings: this.bindings,
    });

    this.stacks.set(stack.stackName, stack);

    await stack.deploy();

    return {
      StackId: stack.stackName,
      $metadata: {},
    };
  }
}

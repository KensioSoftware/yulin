import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../../util/background/background.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimCfnStack,
  type SimCloudFormationStackName,
} from "../../stack/sim-cfn-stack.js";
import { SimCloudFormationAlreadyExistsException } from "../../error/sim-cloudformation.error.js";
import type {
  SimCreateStackCommand,
  SimCreateStackCommandOutput,
} from "./create-stack.command.js";
import { SimCfnTemplate } from "../../template/sim-cfn-template.js";
import { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import { makeSimCfnParameterStore } from "../../parameters/store/sim-cfn-parameter-store.js";
import type { SimCdkOutContext } from "../../cdk/sim-cdk-out-context.js";
import type { SimCfnBinding } from "../../bind/sim-cfn-binding.js";
import type { SimCfnExports } from "../../export/sim-cfn-exports.js";
import type { SimCfnResourceOrder } from "../../stack/deploy/sim-cfn-resource-order.js";

interface CreateStackCommandHandlerProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly background: BackgroundScheduler & BackgroundCompleter;
  readonly cdkOutContext?: SimCdkOutContext | undefined;
  readonly bindings?: readonly SimCfnBinding[] | undefined;

  /** The principal the Stack's Resources are created as. */
  readonly caller?: SimAwsCaller | undefined;

  /** The order Resources with no dependency between them are started in. */
  readonly resourceOrder?: SimCfnResourceOrder | undefined;

  readonly exports?: SimCfnExports | undefined;
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
  private readonly bindings: readonly SimCfnBinding[] | undefined;
  private readonly caller: SimAwsCaller | undefined;
  private readonly resourceOrder: SimCfnResourceOrder | undefined;
  private readonly exports: SimCfnExports | undefined;

  constructor(properties: CreateStackCommandHandlerProperties) {
    const {
      simAws,
      accountRegionScope,
      stacks,
      background,
      cdkOutContext,
      bindings,
      caller,
      resourceOrder,
      exports,
    } = properties;

    this.simAws = simAws;
    this.accountRegionScope = accountRegionScope;
    this.stacks = stacks;
    this.background = background;
    this.cdkOutContext = cdkOutContext;
    this.bindings = bindings;
    this.caller = caller;
    this.resourceOrder = resourceOrder;
    this.exports = exports;
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

    const parameters = SimCfnParameters.fromInput(command.input, {
      stackName,
      parameterStore: makeSimCfnParameterStore({
        simAws: this.simAws,
        accountRegionScope: this.accountRegionScope,
      }),
    });

    const template = SimCfnTemplate.fromTemplateBody(
      command.input.TemplateBody,
      {
        stackName,
        parameters,
        accountRegionScope: this.accountRegionScope,
        exports: this.exports,
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
      caller: this.caller,
      resourceOrder: this.resourceOrder,
      exports: this.exports,
    });

    this.stacks.set(stack.stackName, stack);

    await stack.deploy();

    return {
      StackId: stack.stackName,
      $metadata: {},
    };
  }
}

import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../../util/background/background.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCdkOutContext } from "../../cdk/sim-cdk-out-context.js";
import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "../../stack/sim-cfn-stack.js";
import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";
import type { SimCfnExports } from "../../export/sim-cfn-exports.js";
import { assertSimCfnUpdateStackTemplateSource } from "./update-stack-previous-values.js";
import { simCfnUpdateStackTemplate } from "./update-stack-template.js";
import type {
  SimUpdateStackCommand,
  SimUpdateStackCommandOutput,
} from "./update-stack.command.js";

interface UpdateStackCommandHandlerProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly background: BackgroundScheduler & BackgroundCompleter;

  /**
   * The CDK cloud assembly the new template was synthesized into, for an update
   * applied from a template file rather than from an SDK Command.
   */
  readonly cdkOutContext?: SimCdkOutContext | undefined;

  /**
   * The principal to apply the changed template as, for an update that names
   * one. Left out, the Stack goes on running as whoever deployed it.
   */
  readonly caller?: SimAwsCaller | undefined;

  /** The export names published in this Account and Region. */
  readonly exports?: SimCfnExports | undefined;
}

/**
 * Simulated CloudFormation UpdateStackCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/UpdateStackCommand/
 */
export class UpdateStackCommandHandler implements CommandHandler<
  SimUpdateStackCommand,
  SimUpdateStackCommandOutput
> {
  private readonly simAws: SimAws;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  private readonly background: BackgroundScheduler & BackgroundCompleter;
  private readonly cdkOutContext: SimCdkOutContext | undefined;
  private readonly caller: SimAwsCaller | undefined;
  private readonly exports: SimCfnExports | undefined;

  constructor(properties: UpdateStackCommandHandlerProperties) {
    this.simAws = properties.simAws;
    this.accountRegionScope = properties.accountRegionScope;
    this.stacks = properties.stacks;
    this.background = properties.background;
    this.cdkOutContext = properties.cdkOutContext;
    this.caller = properties.caller;
    this.exports = properties.exports;
  }

  /**
   * Apply a changed template to a simulated CloudFormation Stack.
   *
   * A Stack name the service does not hold is refused with the ValidationError
   * DescribeStacks answers it with, because unlike DeleteStack there is nothing
   * an update of a Stack that is not there could mean.
   *
   * The call returns once the update has started. The Resources are reconciled
   * in the background, so a caller that needs the result should follow this
   * with waitForStackUpdateComplete(...).
   */
  async handle(
    command: SimUpdateStackCommand,
  ): Promise<SimUpdateStackCommandOutput> {
    assertDefined(
      command.input.StackName,
      "UpdateStackCommand.input.StackName",
    );
    assertSimCfnUpdateStackTemplateSource(command.input);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const stackName = command.input.StackName as SimCloudFormationStackName;
    const stack = this.stacks.get(stackName);

    if (stack === undefined) {
      throw new SimCloudFormationValidationError(
        `Stack with id ${stackName} does not exist`,
      );
    }

    await stack.update(
      simCfnUpdateStackTemplate({
        simAws: this.simAws,
        accountRegionScope: this.accountRegionScope,
        stack,
        input: command.input,
        exports: this.exports,
      }),
      { cdkOutContext: this.cdkOutContext, caller: this.caller },
    );

    return {
      StackId: stack.stackId,
      $metadata: {},
    };
  }
}

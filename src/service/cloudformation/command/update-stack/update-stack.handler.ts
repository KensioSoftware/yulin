import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../../util/background/background.js";
import type { JSONString } from "../../../../util/type-guard/json.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type {
  SimCfnStack,
  SimCloudFormationStackName,
} from "../../stack/sim-cfn-stack.js";
import {
  type CfnTemplateBodyRecord,
  SimCfnTemplate,
} from "../../template/sim-cfn-template.js";
import { SimCfnParameters } from "../../parameters/sim-cfn-parameters.js";
import { SimCloudFormationValidationError } from "../../error/sim-cloudformation.error.js";
import type {
  SimUpdateStackCommand,
  SimUpdateStackCommandOutput,
} from "./update-stack.command.js";

interface UpdateStackCommandHandlerProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly background: BackgroundScheduler & BackgroundCompleter;
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
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  private readonly background: BackgroundScheduler & BackgroundCompleter;

  constructor(properties: UpdateStackCommandHandlerProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.stacks = properties.stacks;
    this.background = properties.background;
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
    assertDefined(
      command.input.TemplateBody,
      "UpdateStackCommand.input.TemplateBody",
    );

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
      SimCfnTemplate.fromJson(
        command.input.TemplateBody as JSONString<CfnTemplateBodyRecord>,
        {
          stackName,
          parameters: SimCfnParameters.fromInput(command.input, { stackName }),
          accountRegionScope: this.accountRegionScope,
        },
      ),
    );

    return {
      StackId: stack.stackName,
      $metadata: {},
    };
  }
}

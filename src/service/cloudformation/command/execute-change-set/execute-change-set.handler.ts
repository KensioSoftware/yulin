import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../../util/background/background.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimCfnStack } from "../../stack/sim-cfn-stack.js";
import type { SimCloudFormationStackName } from "../../stack/sim-cfn-stack.type.js";
import type { SimCfnChangeSets } from "../../changeset/sim-cfn-change-sets.js";
import { simCfnChangeSetDeployedStack } from "../../changeset/sim-cfn-change-set-stack.js";
import { runSimCfnChangeSet } from "../../changeset/sim-cfn-change-set-execution.js";
import type {
  SimExecuteChangeSetCommand,
  SimExecuteChangeSetCommandOutput,
} from "./execute-change-set.command.js";

interface ExecuteChangeSetCommandHandlerProperties {
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly changeSets: SimCfnChangeSets;
  readonly background: BackgroundScheduler & BackgroundCompleter;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Simulated CloudFormation ExecuteChangeSetCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/ExecuteChangeSetCommand/
 */
export class ExecuteChangeSetCommandHandler implements CommandHandler<
  SimExecuteChangeSetCommand,
  SimExecuteChangeSetCommandOutput
> {
  private readonly properties: ExecuteChangeSetCommandHandlerProperties;

  constructor(properties: ExecuteChangeSetCommandHandlerProperties) {
    this.properties = properties;
  }

  /**
   * Apply what a change set describes to its Stack.
   *
   * The call returns once the Stack operation has started, as CreateStack and
   * UpdateStack do. A caller that needs the result should follow this with
   * waitForStackDeployComplete(...) or waitForStackUpdateComplete(...).
   */
  async handle(
    command: SimExecuteChangeSetCommand,
  ): Promise<SimExecuteChangeSetCommandOutput> {
    const { ChangeSetName, StackName } = command.input;
    assertDefined(ChangeSetName, "ExecuteChangeSetCommand.input.ChangeSetName");

    // Allow for potential non-deterministic sequencing of async events.
    await this.properties.background.sequence();

    const changeSet = this.properties.changeSets.requireExecutable({
      changeSetName: ChangeSetName,
      stackName: StackName,
    });

    await runSimCfnChangeSet({
      ...this.properties,
      changeSet,
      stack: simCfnChangeSetDeployedStack(this.properties.stacks, changeSet),
    });

    return { $metadata: {} };
  }
}

import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimCfnChangeSets } from "../../changeset/sim-cfn-change-sets.js";
import type { SimCloudFormationStackName } from "../../stack/sim-cfn-stack.type.js";
import type {
  SimListChangeSetsCommand,
  SimListChangeSetsCommandOutput,
} from "./list-change-sets.command.js";

interface ListChangeSetsCommandHandlerProperties {
  readonly changeSets: SimCfnChangeSets;
  readonly background: BackgroundScheduler;
}

/**
 * Simulated CloudFormation ListChangeSetsCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/ListChangeSetsCommand/
 */
export class ListChangeSetsCommandHandler implements CommandHandler<
  SimListChangeSetsCommand,
  SimListChangeSetsCommandOutput
> {
  private readonly changeSets: SimCfnChangeSets;
  private readonly background: BackgroundScheduler;

  constructor(properties: ListChangeSetsCommandHandlerProperties) {
    this.changeSets = properties.changeSets;
    this.background = properties.background;
  }

  /**
   * List the change sets held against one Stack.
   *
   * A change set DeleteChangeSet has taken away is gone from here, as it is in
   * CloudFormation.
   */
  async handle(
    command: SimListChangeSetsCommand,
  ): Promise<SimListChangeSetsCommandOutput> {
    assertDefined(
      command.input.StackName,
      "ListChangeSetsCommand.input.StackName",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const stackName = command.input.StackName as SimCloudFormationStackName;

    return {
      Summaries: this.changeSets.forStack(stackName).map((changeSet) => ({
        ChangeSetId: changeSet.changeSetId,
        ChangeSetName: changeSet.changeSetName,
        StackId: changeSet.stackName,
        StackName: changeSet.stackName,
        Description: changeSet.description,
        Status: changeSet.status,
        StatusReason: changeSet.statusReason,
        ExecutionStatus: changeSet.executionStatus,
      })),
      $metadata: {},
    };
  }
}

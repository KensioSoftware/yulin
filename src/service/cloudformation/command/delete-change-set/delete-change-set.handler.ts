import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimCfnChangeSets } from "../../changeset/sim-cfn-change-sets.js";
import type {
  SimDeleteChangeSetCommand,
  SimDeleteChangeSetCommandOutput,
} from "./delete-change-set.command.js";

interface DeleteChangeSetCommandHandlerProperties {
  readonly changeSets: SimCfnChangeSets;
  readonly background: BackgroundScheduler;
}

/**
 * Simulated CloudFormation DeleteChangeSetCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/DeleteChangeSetCommand/
 */
export class DeleteChangeSetCommandHandler implements CommandHandler<
  SimDeleteChangeSetCommand,
  SimDeleteChangeSetCommandOutput
> {
  private readonly changeSets: SimCfnChangeSets;
  private readonly background: BackgroundScheduler;

  constructor(properties: DeleteChangeSetCommandHandlerProperties) {
    this.changeSets = properties.changeSets;
    this.background = properties.background;
  }

  /**
   * Take a change set away without executing it.
   *
   * A change set name that is not there is a success, as it is in
   * CloudFormation: DeleteChangeSet says the change set should be gone, and one
   * that has already gone satisfies that.
   */
  async handle(
    command: SimDeleteChangeSetCommand,
  ): Promise<SimDeleteChangeSetCommandOutput> {
    assertDefined(
      command.input.ChangeSetName,
      "DeleteChangeSetCommand.input.ChangeSetName",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const changeSet = this.changeSets.find({
      changeSetName: command.input.ChangeSetName,
      stackName: command.input.StackName,
    });

    if (changeSet !== undefined) {
      changeSet.status = "DELETE_COMPLETE";
      this.changeSets.remove(changeSet);
    }

    return { $metadata: {} };
  }
}

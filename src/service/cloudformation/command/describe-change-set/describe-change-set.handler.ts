import type { CommandHandler } from "../../../../command/command-handler.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { BackgroundScheduler } from "../../../../util/background/background.js";
import type { SimCfnChangeSet } from "../../changeset/sim-cfn-change-set.js";
import type { SimCfnChangeSets } from "../../changeset/sim-cfn-change-sets.js";
import type {
  SimCfnChangeDescription,
  SimDescribeChangeSetCommand,
  SimDescribeChangeSetCommandOutput,
} from "./describe-change-set.command.js";

interface DescribeChangeSetCommandHandlerProperties {
  readonly changeSets: SimCfnChangeSets;
  readonly background: BackgroundScheduler;
}

/**
 * Simulated CloudFormation DescribeChangeSetCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/DescribeChangeSetCommand/
 */
export class DescribeChangeSetCommandHandler implements CommandHandler<
  SimDescribeChangeSetCommand,
  SimDescribeChangeSetCommandOutput
> {
  private readonly changeSets: SimCfnChangeSets;
  private readonly background: BackgroundScheduler;

  constructor(properties: DescribeChangeSetCommandHandlerProperties) {
    this.changeSets = properties.changeSets;
    this.background = properties.background;
  }

  /**
   * Report what a change set would do to its Stack.
   */
  async handle(
    command: SimDescribeChangeSetCommand,
  ): Promise<SimDescribeChangeSetCommandOutput> {
    assertDefined(
      command.input.ChangeSetName,
      "DescribeChangeSetCommand.input.ChangeSetName",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const changeSet = this.changeSets.require({
      changeSetName: command.input.ChangeSetName,
      stackName: command.input.StackName,
    });

    return {
      ChangeSetId: changeSet.changeSetId,
      ChangeSetName: changeSet.changeSetName,
      StackId: changeSet.stackName,
      StackName: changeSet.stackName,
      Description: changeSet.description,
      Status: changeSet.status,
      StatusReason: changeSet.statusReason,
      ExecutionStatus: changeSet.executionStatus,
      Changes: describedChanges(changeSet),
      $metadata: {},
    };
  }
}

/**
 * The Resource changes in the shape DescribeChangeSet answers with.
 */
function describedChanges(
  changeSet: SimCfnChangeSet,
): SimCfnChangeDescription[] {
  return changeSet.changes.map((change) => ({
    Type: "Resource" as const,
    ResourceChange: {
      Action: change.action,
      LogicalResourceId: change.logicalResourceId,
      ResourceType: change.resourceType,
      Replacement: change.replacement,
    },
  }));
}

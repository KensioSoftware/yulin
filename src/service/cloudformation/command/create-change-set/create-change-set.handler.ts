import type { CommandHandler } from "../../../../command/command-handler.js";
import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../../util/background/background.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimCfnStack } from "../../stack/sim-cfn-stack.js";
import type { SimCloudFormationStackName } from "../../stack/sim-cfn-stack.type.js";
import { simCfnCommandTemplate } from "../../template/sim-cfn-command-template.js";
import type { SimCfnExports } from "../../export/sim-cfn-exports.js";
import { SimCloudFormationAlreadyExistsException } from "../../error/sim-cloudformation.error.js";
import { SimCfnChangeSet } from "../../changeset/sim-cfn-change-set.js";
import type { SimCfnChangeSets } from "../../changeset/sim-cfn-change-sets.js";
import type { SimCfnChangeSetName } from "../../changeset/sim-cfn-change-set.type.js";
import { simCfnChangeSetPlan } from "../../changeset/sim-cfn-change-set-changes.js";
import { simCfnChangeSetRequest } from "../../changeset/sim-cfn-change-set-input.js";
import { simCfnChangeSetStack } from "../../changeset/sim-cfn-change-set-stack.js";
import { simCfnChangeSetStackId } from "../../changeset/sim-cfn-change-set-stack-id.js";
import { simCfnChangeSetFailure } from "../../changeset/sim-cfn-change-set-failure.js";
import type {
  SimCreateChangeSetCommand,
  SimCreateChangeSetCommandOutput,
} from "./create-change-set.command.js";

interface CreateChangeSetCommandHandlerProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly changeSets: SimCfnChangeSets;
  readonly background: BackgroundScheduler & BackgroundCompleter;
  readonly caller?: SimAwsCaller | undefined;
  readonly exports?: SimCfnExports | undefined;
}

/**
 * Simulated CloudFormation CreateChangeSetCommand handler.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudformation/command/CreateChangeSetCommand/
 */
export class CreateChangeSetCommandHandler implements CommandHandler<
  SimCreateChangeSetCommand,
  SimCreateChangeSetCommandOutput
> {
  private readonly properties: CreateChangeSetCommandHandlerProperties;

  constructor(properties: CreateChangeSetCommandHandlerProperties) {
    this.properties = properties;
  }

  /**
   * Work out what a template would change about a Stack, and hold it.
   *
   * Nothing is created, deleted or replaced here. A `CREATE` change set puts
   * the Stack itself in `REVIEW_IN_PROGRESS` holding no created Resources, and
   * an `UPDATE` change set leaves the deployed Stack exactly as it is.
   */
  async handle(
    command: SimCreateChangeSetCommand,
  ): Promise<SimCreateChangeSetCommandOutput> {
    const request = simCfnChangeSetRequest(command.input);

    // Allow for potential non-deterministic sequencing of async events.
    await this.properties.background.sequence();

    this.assertNameFree(request.stackName, request.changeSetName);

    const stackId = simCfnChangeSetStackId({
      ...this.properties,
      ...request,
    });
    const template = simCfnCommandTemplate({
      ...this.properties,
      ...request,
      stackId,
      input: command.input,
    });
    const stack = simCfnChangeSetStack({
      ...this.properties,
      ...request,
      stackId,
      template,
    });
    const changes = simCfnChangeSetPlan({
      ...this.properties,
      ...request,
      stack,
      template,
    });

    const changeSet = new SimCfnChangeSet({
      ...this.properties,
      ...request,
      stackId,
      template,
      changes,
      plannedFrom: stack.currentTemplate,
      description: command.input.Description,
      failureReason: simCfnChangeSetFailure({
        ...request,
        stack,
        template,
        changeCount: changes.length,
      }),
    });

    this.properties.changeSets.add(changeSet);

    return {
      Id: changeSet.changeSetId,
      StackId: stack.stackId,
      $metadata: {},
    };
  }

  private assertNameFree(
    stackName: SimCloudFormationStackName,
    changeSetName: SimCfnChangeSetName,
  ): void {
    if (this.properties.changeSets.has(stackName, changeSetName)) {
      throw new SimCloudFormationAlreadyExistsException(
        `ChangeSet [${changeSetName}] already exists`,
      );
    }
  }
}

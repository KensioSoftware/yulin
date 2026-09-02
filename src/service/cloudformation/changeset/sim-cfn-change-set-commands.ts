import type {
  BackgroundCompleter,
  BackgroundScheduler,
} from "../../../util/background/background.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimCfnStack } from "../stack/sim-cfn-stack.js";
import type { SimCloudFormationStackName } from "../stack/sim-cfn-stack.type.js";
import type { SimCfnExports } from "../export/sim-cfn-exports.js";
import type { SimCloudFormationAuthorization } from "../authorize/sim-cloudformation-authorization.js";
import type {
  SimCreateChangeSetCommand,
  SimCreateChangeSetCommandOutput,
} from "../command/create-change-set/create-change-set.command.js";
import { CreateChangeSetCommandHandler } from "../command/create-change-set/create-change-set.handler.js";
import type {
  SimDescribeChangeSetCommand,
  SimDescribeChangeSetCommandOutput,
} from "../command/describe-change-set/describe-change-set.command.js";
import { DescribeChangeSetCommandHandler } from "../command/describe-change-set/describe-change-set.handler.js";
import type {
  SimExecuteChangeSetCommand,
  SimExecuteChangeSetCommandOutput,
} from "../command/execute-change-set/execute-change-set.command.js";
import { ExecuteChangeSetCommandHandler } from "../command/execute-change-set/execute-change-set.handler.js";
import type {
  SimDeleteChangeSetCommand,
  SimDeleteChangeSetCommandOutput,
} from "../command/delete-change-set/delete-change-set.command.js";
import { DeleteChangeSetCommandHandler } from "../command/delete-change-set/delete-change-set.handler.js";
import type {
  SimListChangeSetsCommand,
  SimListChangeSetsCommandOutput,
} from "../command/list-change-sets/list-change-sets.command.js";
import { ListChangeSetsCommandHandler } from "../command/list-change-sets/list-change-sets.handler.js";
import { SimCfnChangeSets } from "./sim-cfn-change-sets.js";

interface SimCfnChangeSetCommandsProperties {
  readonly simAws: SimAws;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly stacks: Map<SimCloudFormationStackName, SimCfnStack>;
  readonly background: BackgroundScheduler & BackgroundCompleter;
  readonly authorization: SimCloudFormationAuthorization;
  readonly exports?: SimCfnExports | undefined;
}

/**
 * The change set half of simulated CloudFormation's SDK surface.
 *
 * The five change set commands share one registry of held change sets and the
 * same Stack map every other command reads, so they are assembled once here
 * rather than in SimCloudFormation alongside the Stack commands.
 *
 * Authorization happens here rather than in SimCloudFormation, because three of
 * the five commands can name a change set by its ARN alone. The Stack such a
 * request operates on is the one the change set belongs to, and only this
 * registry knows which that is.
 */
export class SimCfnChangeSetCommands {
  private readonly properties: SimCfnChangeSetCommandsProperties;
  private readonly changeSets = new SimCfnChangeSets();

  constructor(properties: SimCfnChangeSetCommandsProperties) {
    this.properties = properties;
  }

  /** Work out what a template would change about a Stack, and hold it. */
  async create(
    command: SimCreateChangeSetCommand,
    caller?: SimAwsCaller,
  ): Promise<SimCreateChangeSetCommandOutput> {
    this.properties.authorization.createChangeSet(
      command.input.StackName,
      caller,
    );

    return await new CreateChangeSetCommandHandler({
      ...this.properties,
      changeSets: this.changeSets,
      caller,
    }).handle(command);
  }

  /** Report what a held change set would do to its Stack. */
  async describe(
    command: SimDescribeChangeSetCommand,
    caller?: SimAwsCaller,
  ): Promise<SimDescribeChangeSetCommandOutput> {
    this.properties.authorization.describeChangeSet(
      this.stackNameFor(command.input),
      caller,
    );

    return await new DescribeChangeSetCommandHandler({
      changeSets: this.changeSets,
      background: this.properties.background,
    }).handle(command);
  }

  /** Apply what a change set describes to its Stack. */
  async execute(
    command: SimExecuteChangeSetCommand,
    caller?: SimAwsCaller,
  ): Promise<SimExecuteChangeSetCommandOutput> {
    this.properties.authorization.executeChangeSet(
      this.stackNameFor(command.input),
      caller,
    );

    return await new ExecuteChangeSetCommandHandler({
      stacks: this.properties.stacks,
      changeSets: this.changeSets,
      background: this.properties.background,
      caller,
    }).handle(command);
  }

  /** Take a change set away without executing it. */
  async delete(
    command: SimDeleteChangeSetCommand,
    caller?: SimAwsCaller,
  ): Promise<SimDeleteChangeSetCommandOutput> {
    this.properties.authorization.deleteChangeSet(
      this.stackNameFor(command.input),
      caller,
    );

    return await new DeleteChangeSetCommandHandler({
      changeSets: this.changeSets,
      background: this.properties.background,
    }).handle(command);
  }

  /** List the change sets held against one Stack. */
  async list(
    command: SimListChangeSetsCommand,
    caller?: SimAwsCaller,
  ): Promise<SimListChangeSetsCommandOutput> {
    this.properties.authorization.listChangeSets(
      command.input.StackName,
      caller,
    );

    return await new ListChangeSetsCommandHandler({
      changeSets: this.changeSets,
      background: this.properties.background,
    }).handle(command);
  }

  /**
   * The Stack a request naming one change set operates on.
   *
   * A request carrying the change set ARN alone leaves out the Stack name, and
   * the change set it names knows which Stack it belongs to. Authorizing on
   * what the request said would ask about every Stack in the scope, so a
   * caller allowed one Stack would be refused a change set against it.
   *
   * A change set the registry does not hold falls back to what the request
   * said. The handler refuses it, and refusing an unauthorized caller first is
   * what keeps that refusal from saying which change sets exist.
   */
  private stackNameFor(input: {
    readonly ChangeSetName?: string | undefined;
    readonly StackName?: string | undefined;
  }): string | undefined {
    if (input.ChangeSetName === undefined) {
      return input.StackName;
    }

    return (
      this.changeSets.find({
        changeSetName: input.ChangeSetName,
        stackName: input.StackName,
      })?.stackName ?? input.StackName
    );
  }
}

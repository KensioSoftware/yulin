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
  readonly exports?: SimCfnExports | undefined;
}

/**
 * The change set half of simulated CloudFormation's SDK surface.
 *
 * The five change set commands share one registry of held change sets and the
 * same Stack map every other command reads, so they are assembled once here
 * rather than in SimCloudFormation alongside the Stack commands.
 *
 * Authorization stays outside. SimCloudFormation decides whether the caller may
 * run the command before handing it here.
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
    return await new CreateChangeSetCommandHandler({
      ...this.properties,
      changeSets: this.changeSets,
      caller,
    }).handle(command);
  }

  /** Report what a held change set would do to its Stack. */
  async describe(
    command: SimDescribeChangeSetCommand,
  ): Promise<SimDescribeChangeSetCommandOutput> {
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
  ): Promise<SimDeleteChangeSetCommandOutput> {
    return await new DeleteChangeSetCommandHandler({
      changeSets: this.changeSets,
      background: this.properties.background,
    }).handle(command);
  }

  /** List the change sets held against one Stack. */
  async list(
    command: SimListChangeSetsCommand,
  ): Promise<SimListChangeSetsCommandOutput> {
    return await new ListChangeSetsCommandHandler({
      changeSets: this.changeSets,
      background: this.properties.background,
    }).handle(command);
  }
}

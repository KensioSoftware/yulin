import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type * as simPersonalizeCommands from "./command/sim-personalize-command.types.js";
import { SimPersonalizeCommands } from "./command/sim-personalize-commands.js";
import type { SimPersonalizeRequestOptions } from "./command/sim-personalize-request-options.js";
import type { SimPersonalizeCampaign } from "./resource/sim-personalize-campaign.js";
import type { SimPersonalizeDatasetGroup } from "./resource/sim-personalize-dataset-group.js";
import { SimPersonalizeResources } from "./resource/sim-personalize-resources.js";
import type { SimPersonalizeSolution } from "./resource/sim-personalize-solution.js";
import { SimPersonalizeSdkCommandRouter } from "./sdk/sim-personalize-sdk-command-router.js";

interface SimPersonalizeProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated Amazon Personalize. Handles SDK commands. Emulates AWS behaviour
 * and state.
 *
 * Nothing here trains a model or reads any data. The resources exist, they
 * carry what the request gave them, and they reach `ACTIVE` immediately, in
 * the way simulated ACM issues certificates without producing real TLS
 * certificates. What a campaign then recommends is declared against it rather
 * than learned.
 */
export class SimPersonalize {
  private readonly resources = new SimPersonalizeResources();
  private readonly commands: SimPersonalizeCommands;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimPersonalizeSdkCommandRouter(this);

  constructor(properties: SimPersonalizeProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.background = background;
    this.commands = new SimPersonalizeCommands({
      resources: this.resources,
      iam,
      accountRegionScope,
      clock: background,
    });
  }

  /**
   * Find a dataset group by name.
   *
   * This and the accessors below are the simulator's own, for tests inspecting
   * state without going through a Command and its authorization.
   */
  findDatasetGroup(name: string): SimPersonalizeDatasetGroup | undefined {
    return this.resources.datasetGroups.findByName(name);
  }

  /** Find a solution by name. */
  findSolution(name: string): SimPersonalizeSolution | undefined {
    return this.resources.solutions.findByName(name);
  }

  /** Find a campaign by name. */
  findCampaign(name: string): SimPersonalizeCampaign | undefined {
    return this.resources.campaigns.findByName(name);
  }

  /** Handle a CreateDatasetGroup Command from the SDK. */
  async createDatasetGroup(
    command: simPersonalizeCommands.SimCreateDatasetGroupCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimCreateDatasetGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.datasetGroupWrites.create(command, options);
  }

  /** Handle a DescribeDatasetGroup Command from the SDK. */
  async describeDatasetGroup(
    command: simPersonalizeCommands.SimDescribeDatasetGroupCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDescribeDatasetGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.datasetGroupReads.describe(command, options);
  }

  /** Handle a ListDatasetGroups Command from the SDK. */
  async listDatasetGroups(
    command: simPersonalizeCommands.SimListDatasetGroupsCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimListDatasetGroupsCommandOutput> {
    await this.background.sequence();
    return this.commands.datasetGroupReads.list(command, options);
  }

  /** Handle a DeleteDatasetGroup Command from the SDK. */
  async deleteDatasetGroup(
    command: simPersonalizeCommands.SimDeleteDatasetGroupCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDeleteDatasetGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.datasetGroupWrites.delete(command, options);
  }

  /** Handle a CreateSchema Command from the SDK. */
  async createSchema(
    command: simPersonalizeCommands.SimCreateSchemaCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimCreateSchemaCommandOutput> {
    await this.background.sequence();
    return this.commands.schemaWrites.create(command, options);
  }

  /** Handle a DescribeSchema Command from the SDK. */
  async describeSchema(
    command: simPersonalizeCommands.SimDescribeSchemaCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDescribeSchemaCommandOutput> {
    await this.background.sequence();
    return this.commands.schemaReads.describe(command, options);
  }

  /** Handle a ListSchemas Command from the SDK. */
  async listSchemas(
    command: simPersonalizeCommands.SimListSchemasCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimListSchemasCommandOutput> {
    await this.background.sequence();
    return this.commands.schemaReads.list(command, options);
  }

  /** Handle a DeleteSchema Command from the SDK. */
  async deleteSchema(
    command: simPersonalizeCommands.SimDeleteSchemaCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDeleteSchemaCommandOutput> {
    await this.background.sequence();
    return this.commands.schemaWrites.delete(command, options);
  }

  /** Handle a CreateDataset Command from the SDK. */
  async createDataset(
    command: simPersonalizeCommands.SimCreateDatasetCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimCreateDatasetCommandOutput> {
    await this.background.sequence();
    return this.commands.datasetWrites.create(command, options);
  }

  /** Handle a DescribeDataset Command from the SDK. */
  async describeDataset(
    command: simPersonalizeCommands.SimDescribeDatasetCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDescribeDatasetCommandOutput> {
    await this.background.sequence();
    return this.commands.datasetReads.describe(command, options);
  }

  /** Handle a ListDatasets Command from the SDK. */
  async listDatasets(
    command: simPersonalizeCommands.SimListDatasetsCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimListDatasetsCommandOutput> {
    await this.background.sequence();
    return this.commands.datasetReads.list(command, options);
  }

  /** Handle a DeleteDataset Command from the SDK. */
  async deleteDataset(
    command: simPersonalizeCommands.SimDeleteDatasetCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDeleteDatasetCommandOutput> {
    await this.background.sequence();
    return this.commands.datasetWrites.delete(command, options);
  }

  /** Handle a CreateSolution Command from the SDK. */
  async createSolution(
    command: simPersonalizeCommands.SimCreateSolutionCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimCreateSolutionCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionWrites.create(command, options);
  }

  /** Handle a DescribeSolution Command from the SDK. */
  async describeSolution(
    command: simPersonalizeCommands.SimDescribeSolutionCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDescribeSolutionCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionReads.describe(command, options);
  }

  /** Handle a ListSolutions Command from the SDK. */
  async listSolutions(
    command: simPersonalizeCommands.SimListSolutionsCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimListSolutionsCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionReads.list(command, options);
  }

  /** Handle a DeleteSolution Command from the SDK. */
  async deleteSolution(
    command: simPersonalizeCommands.SimDeleteSolutionCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDeleteSolutionCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionWrites.delete(command, options);
  }

  /** Handle a CreateSolutionVersion Command from the SDK. */
  async createSolutionVersion(
    command: simPersonalizeCommands.SimCreateSolutionVersionCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimCreateSolutionVersionCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionVersionWrites.create(command, options);
  }

  /** Handle a DescribeSolutionVersion Command from the SDK. */
  async describeSolutionVersion(
    command: simPersonalizeCommands.SimDescribeSolutionVersionCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDescribeSolutionVersionCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionVersionReads.describe(command, options);
  }

  /** Handle a ListSolutionVersions Command from the SDK. */
  async listSolutionVersions(
    command: simPersonalizeCommands.SimListSolutionVersionsCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimListSolutionVersionsCommandOutput> {
    await this.background.sequence();
    return this.commands.solutionVersionReads.list(command, options);
  }

  /** Handle a CreateCampaign Command from the SDK. */
  async createCampaign(
    command: simPersonalizeCommands.SimCreateCampaignCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimCreateCampaignCommandOutput> {
    await this.background.sequence();
    return this.commands.campaignWrites.create(command, options);
  }

  /** Handle a DescribeCampaign Command from the SDK. */
  async describeCampaign(
    command: simPersonalizeCommands.SimDescribeCampaignCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDescribeCampaignCommandOutput> {
    await this.background.sequence();
    return this.commands.campaignReads.describe(command, options);
  }

  /** Handle a ListCampaigns Command from the SDK. */
  async listCampaigns(
    command: simPersonalizeCommands.SimListCampaignsCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimListCampaignsCommandOutput> {
    await this.background.sequence();
    return this.commands.campaignReads.list(command, options);
  }

  /** Handle a DeleteCampaign Command from the SDK. */
  async deleteCampaign(
    command: simPersonalizeCommands.SimDeleteCampaignCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDeleteCampaignCommandOutput> {
    await this.background.sequence();
    return this.commands.campaignWrites.delete(command, options);
  }

  /** The SDK Command router for this simulated Personalize. */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}

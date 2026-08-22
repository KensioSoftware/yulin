import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type * as simPersonalizeCommands from "./command/sim-personalize-command.types.js";
import { SimPersonalizeCommands } from "./command/sim-personalize-commands.js";
import type { SimPersonalizeRequestOptions } from "./command/sim-personalize-request-options.js";
import { SimPersonalizeResources } from "./resource/sim-personalize-resources.js";

export interface SimPersonalizeProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * The operations of the Personalize control plane API that are about data.
 *
 * A dataset group is the container everything else hangs off. It holds the
 * schemas, the datasets those schemas describe, and the event tracker that
 * feeds interactions into them. These sixteen calls are that side of the
 * control plane.
 *
 * The rest of the control plane is on `SimPersonalizeControlPlane`, which
 * extends this. The two are split because one class carrying all twenty-six
 * operations is a list and nothing else, and because a file has a line limit.
 */
export abstract class SimPersonalizeDataOperations {
  protected readonly resources = new SimPersonalizeResources();
  protected readonly commands: SimPersonalizeCommands;
  protected readonly background: BackgroundScheduler;

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

  /** Handle a CreateEventTracker Command from the SDK. */
  async createEventTracker(
    command: simPersonalizeCommands.SimCreateEventTrackerCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimCreateEventTrackerCommandOutput> {
    await this.background.sequence();
    return this.commands.eventTrackerWrites.create(command, options);
  }

  /** Handle a DescribeEventTracker Command from the SDK. */
  async describeEventTracker(
    command: simPersonalizeCommands.SimDescribeEventTrackerCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDescribeEventTrackerCommandOutput> {
    await this.background.sequence();
    return this.commands.eventTrackerReads.describe(command, options);
  }

  /** Handle a ListEventTrackers Command from the SDK. */
  async listEventTrackers(
    command: simPersonalizeCommands.SimListEventTrackersCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimListEventTrackersCommandOutput> {
    await this.background.sequence();
    return this.commands.eventTrackerReads.list(command, options);
  }

  /** Handle a DeleteEventTracker Command from the SDK. */
  async deleteEventTracker(
    command: simPersonalizeCommands.SimDeleteEventTrackerCommand,
    options?: SimPersonalizeRequestOptions,
  ): Promise<simPersonalizeCommands.SimDeleteEventTrackerCommandOutput> {
    await this.background.sequence();
    return this.commands.eventTrackerWrites.delete(command, options);
  }
}

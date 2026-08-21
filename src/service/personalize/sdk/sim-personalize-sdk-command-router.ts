import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimCreateCampaignCommand,
  SimDeleteCampaignCommand,
  SimDescribeCampaignCommand,
  SimListCampaignsCommand,
} from "../command/campaign/campaign.command.js";
import type {
  SimCreateDatasetGroupCommand,
  SimDeleteDatasetGroupCommand,
  SimDescribeDatasetGroupCommand,
  SimListDatasetGroupsCommand,
} from "../command/dataset-group/dataset-group.command.js";
import type {
  SimCreateDatasetCommand,
  SimDeleteDatasetCommand,
  SimDescribeDatasetCommand,
  SimListDatasetsCommand,
} from "../command/dataset/dataset.command.js";
import type {
  SimCreateSchemaCommand,
  SimDeleteSchemaCommand,
  SimDescribeSchemaCommand,
  SimListSchemasCommand,
} from "../command/schema/schema.command.js";
import type {
  SimCreateSolutionCommand,
  SimCreateSolutionVersionCommand,
  SimDeleteSolutionCommand,
  SimDescribeSolutionCommand,
  SimDescribeSolutionVersionCommand,
  SimListSolutionVersionsCommand,
  SimListSolutionsCommand,
} from "../command/solution/solution.command.js";
import type { SimPersonalize } from "../sim-personalize.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Personalize.
 */
export class SimPersonalizeSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simPersonalize: SimPersonalize) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateDatasetGroupCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.createDatasetGroup(
            command as SimCreateDatasetGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeDatasetGroupCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.describeDatasetGroup(
            command as SimDescribeDatasetGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListDatasetGroupsCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.listDatasetGroups(
            command as SimListDatasetGroupsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteDatasetGroupCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.deleteDatasetGroup(
            command as SimDeleteDatasetGroupCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateSchemaCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.createSchema(
            command as SimCreateSchemaCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeSchemaCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.describeSchema(
            command as SimDescribeSchemaCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListSchemasCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.listSchemas(
            command as SimListSchemasCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteSchemaCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.deleteSchema(
            command as SimDeleteSchemaCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateDatasetCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.createDataset(
            command as SimCreateDatasetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeDatasetCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.describeDataset(
            command as SimDescribeDatasetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListDatasetsCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.listDatasets(
            command as SimListDatasetsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteDatasetCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.deleteDataset(
            command as SimDeleteDatasetCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateSolutionCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.createSolution(
            command as SimCreateSolutionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeSolutionCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.describeSolution(
            command as SimDescribeSolutionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListSolutionsCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.listSolutions(
            command as SimListSolutionsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteSolutionCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.deleteSolution(
            command as SimDeleteSolutionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateSolutionVersionCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.createSolutionVersion(
            command as SimCreateSolutionVersionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeSolutionVersionCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.describeSolutionVersion(
            command as SimDescribeSolutionVersionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListSolutionVersionsCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.listSolutionVersions(
            command as SimListSolutionVersionsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateCampaignCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.createCampaign(
            command as SimCreateCampaignCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeCampaignCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.describeCampaign(
            command as SimDescribeCampaignCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListCampaignsCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.listCampaigns(
            command as SimListCampaignsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteCampaignCommand",
        async (command, context): Promise<unknown> =>
          await simPersonalize.deleteCampaign(
            command as SimDeleteCampaignCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Personalize can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Personalize supports
   * it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}

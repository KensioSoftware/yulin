import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
} from "../../../../sdk/index.js";
import type {
  SimCreateDatasetGroupCommand,
  SimDeleteDatasetGroupCommand,
  SimDescribeDatasetGroupCommand,
  SimListDatasetGroupsCommand,
} from "../../command/dataset-group/dataset-group.command.js";
import type {
  SimCreateDatasetCommand,
  SimDeleteDatasetCommand,
  SimDescribeDatasetCommand,
  SimListDatasetsCommand,
} from "../../command/dataset/dataset.command.js";
import type {
  SimCreateEventTrackerCommand,
  SimDeleteEventTrackerCommand,
  SimDescribeEventTrackerCommand,
  SimListEventTrackersCommand,
} from "../../command/event-tracker/event-tracker.command.js";
import type {
  SimCreateSchemaCommand,
  SimDeleteSchemaCommand,
  SimDescribeSchemaCommand,
  SimListSchemasCommand,
} from "../../command/schema/schema.command.js";
import type { SimPersonalize } from "../../sim-personalize.js";

/**
 * The SDK routes for the data side of the Personalize control plane.
 *
 * Dataset groups, schemas, datasets and event trackers, which is the split
 * `SimPersonalizeDataOperations` makes on the service itself. The routes are
 * in two files because thirty-four of them in one file is over the line limit,
 * and this is the seam the service already draws.
 */
export function simPersonalizeDataRoutes(
  simPersonalize: SimPersonalize,
): readonly (readonly [string, SimSdkCommandRoute])[] {
  const routes: (readonly [string, SimSdkCommandRoute])[] = [
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
      "CreateEventTrackerCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.createEventTracker(
          command as SimCreateEventTrackerCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DescribeEventTrackerCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.describeEventTracker(
          command as SimDescribeEventTrackerCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "ListEventTrackersCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.listEventTrackers(
          command as SimListEventTrackersCommand,
          simSdkCallerOptions(context),
        ),
    ],
    [
      "DeleteEventTrackerCommand",
      async (command, context): Promise<unknown> =>
        await simPersonalize.deleteEventTracker(
          command as SimDeleteEventTrackerCommand,
          simSdkCallerOptions(context),
        ),
    ],
  ];

  return routes;
}

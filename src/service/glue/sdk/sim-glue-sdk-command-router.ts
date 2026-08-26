import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimCreateDatabaseCommand,
  SimDeleteDatabaseCommand,
  SimGetDatabaseCommand,
  SimGetDatabasesCommand,
} from "../command/database/database.command.js";
import type {
  SimBatchCreatePartitionCommand,
  SimBatchDeletePartitionCommand,
  SimCreatePartitionCommand,
  SimDeletePartitionCommand,
  SimGetPartitionCommand,
  SimGetPartitionsCommand,
} from "../command/partition/partition.command.js";
import type {
  SimCreateTableCommand,
  SimDeleteTableCommand,
  SimGetTableCommand,
  SimGetTablesCommand,
} from "../command/table/table.command.js";
import type { SimGlue } from "../sim-glue.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Glue.
 */
export class SimGlueSdkCommandRouter implements SimSdkCommandRouter {
  readonly #routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simGlue: SimGlue) {
    this.#routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateDatabaseCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.createDatabase(
              command as SimCreateDatabaseCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "GetDatabaseCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.getDatabase(
              command as SimGetDatabaseCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "GetDatabasesCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.getDatabases(
              command as SimGetDatabasesCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "DeleteDatabaseCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.deleteDatabase(
              command as SimDeleteDatabaseCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "CreateTableCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.createTable(
              command as SimCreateTableCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "GetTableCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.getTable(
              command as SimGetTableCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "GetTablesCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.getTables(
              command as SimGetTablesCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "DeleteTableCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.deleteTable(
              command as SimDeleteTableCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "CreatePartitionCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.createPartition(
              command as SimCreatePartitionCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "BatchCreatePartitionCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.batchCreatePartition(
              command as SimBatchCreatePartitionCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "GetPartitionCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.getPartition(
              command as SimGetPartitionCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "GetPartitionsCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.getPartitions(
              command as SimGetPartitionsCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "DeletePartitionCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.deletePartition(
              command as SimDeletePartitionCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
      [
        "BatchDeletePartitionCommand",
        (command, context): Promise<unknown> =>
          Promise.resolve(
            simGlue.batchDeletePartition(
              command as SimBatchDeletePartitionCommand,
              simSdkCallerOptions(context),
            ),
          ),
      ],
    ]);
  }

  /** The SDK Command names simulated Glue can handle. */
  supportedCommandNames(): readonly string[] {
    return this.#routes.keys().toArray();
  }

  /** The simulated Glue operation behind one SDK Command name. */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.#routes.get(commandName);
  }
}

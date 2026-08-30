import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type * as commands from "../command/sim-backup-command.types.js";
import type { SimBackup } from "../sim-backup.js";

/**
 *
 */
export class SimBackupSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(backup: SimBackup) {
    this.routes = new Map([
      route("CreateBackupVaultCommand", (command, options) =>
        backup.createBackupVault(
          command as commands.SimCreateBackupVaultCommand,
          options,
        ),
      ),
      route("DescribeBackupVaultCommand", (command, options) =>
        backup.describeBackupVault(
          command as commands.SimDescribeBackupVaultCommand,
          options,
        ),
      ),
      route("DeleteBackupVaultCommand", (command, options) =>
        backup.deleteBackupVault(
          command as commands.SimDeleteBackupVaultCommand,
          options,
        ),
      ),
      route("ListBackupVaultsCommand", (command, options) =>
        backup.listBackupVaults(
          command as commands.SimListBackupVaultsCommand,
          options,
        ),
      ),
      route("PutBackupVaultLockConfigurationCommand", (command, options) =>
        backup.putBackupVaultLockConfiguration(
          command as commands.SimPutBackupVaultLockConfigurationCommand,
          options,
        ),
      ),
      route("CreateBackupPlanCommand", (command, options) =>
        backup.createBackupPlan(
          command as commands.SimCreateBackupPlanCommand,
          options,
        ),
      ),
      route("GetBackupPlanCommand", (command, options) =>
        backup.getBackupPlan(
          command as commands.SimGetBackupPlanCommand,
          options,
        ),
      ),
      route("CreateBackupSelectionCommand", (command, options) =>
        backup.createBackupSelection(
          command as commands.SimCreateBackupSelectionCommand,
          options,
        ),
      ),
      route("GetBackupSelectionCommand", (command, options) =>
        backup.getBackupSelection(
          command as commands.SimGetBackupSelectionCommand,
          options,
        ),
      ),
      route("ListBackupSelectionsCommand", (command, options) =>
        backup.listBackupSelections(
          command as commands.SimListBackupSelectionsCommand,
          options,
        ),
      ),
    ]);
  }

  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}

function route(
  name: string,
  handle: (
    command: object,
    options: ReturnType<typeof simSdkCallerOptions>,
  ) => Promise<unknown>,
): readonly [string, SimSdkCommandRoute] {
  return [
    name,
    async (command, context): Promise<unknown> =>
      await handle(command, simSdkCallerOptions(context)),
  ];
}

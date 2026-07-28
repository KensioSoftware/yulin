import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimCreateSecretCommand,
  SimDeleteSecretCommand,
  SimDescribeSecretCommand,
  SimListSecretsCommand,
  SimRestoreSecretCommand,
  SimUpdateSecretCommand,
} from "../command/secret/secret.command.js";
import type {
  SimGetSecretValueCommand,
  SimPutSecretValueCommand,
} from "../command/value/value.command.js";
import type { SimSecretsManager } from "../sim-secrets-manager.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated Secrets Manager.
 */
export class SimSecretsManagerSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simSecretsManager: SimSecretsManager) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateSecretCommand",
        async (command, context): Promise<unknown> =>
          await simSecretsManager.createSecret(
            command as SimCreateSecretCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeSecretCommand",
        async (command, context): Promise<unknown> =>
          await simSecretsManager.describeSecret(
            command as SimDescribeSecretCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "UpdateSecretCommand",
        async (command, context): Promise<unknown> =>
          await simSecretsManager.updateSecret(
            command as SimUpdateSecretCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListSecretsCommand",
        async (command, context): Promise<unknown> =>
          await simSecretsManager.listSecrets(
            command as SimListSecretsCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetSecretValueCommand",
        async (command, context): Promise<unknown> =>
          await simSecretsManager.getSecretValue(
            command as SimGetSecretValueCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutSecretValueCommand",
        async (command, context): Promise<unknown> =>
          await simSecretsManager.putSecretValue(
            command as SimPutSecretValueCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DeleteSecretCommand",
        async (command, context): Promise<unknown> =>
          await simSecretsManager.deleteSecret(
            command as SimDeleteSecretCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "RestoreSecretCommand",
        async (command, context): Promise<unknown> =>
          await simSecretsManager.restoreSecret(
            command as SimRestoreSecretCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated Secrets Manager can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated Secrets Manager
   * supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}

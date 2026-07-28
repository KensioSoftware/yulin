import {
  simSdkCallerOptions,
  type SimSdkCommandRoute,
  type SimSdkCommandRouter,
} from "../../../sdk/index.js";
import type {
  SimCreateAliasCommand,
  SimListAliasesCommand,
} from "../command/alias/alias.command.js";
import type {
  SimDecryptCommand,
  SimEncryptCommand,
  SimGenerateDataKeyCommand,
} from "../command/crypto/crypto.command.js";
import type {
  SimCancelKeyDeletionCommand,
  SimCreateKeyCommand,
  SimDescribeKeyCommand,
  SimDisableKeyCommand,
  SimEnableKeyCommand,
  SimGetKeyPolicyCommand,
  SimListKeysCommand,
  SimPutKeyPolicyCommand,
  SimScheduleKeyDeletionCommand,
} from "../command/key/key.command.js";
import type { SimKms } from "../sim-kms.js";

/**
 * Routes intercepted SDK Commands to one scoped simulated KMS instance.
 */
export class SimKmsSdkCommandRouter implements SimSdkCommandRouter {
  private readonly routes: ReadonlyMap<string, SimSdkCommandRoute>;

  constructor(simKms: SimKms) {
    this.routes = new Map<string, SimSdkCommandRoute>([
      [
        "CreateKeyCommand",
        async (command, context): Promise<unknown> =>
          await simKms.createKey(
            command as SimCreateKeyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DescribeKeyCommand",
        async (command, context): Promise<unknown> =>
          await simKms.describeKey(
            command as SimDescribeKeyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListKeysCommand",
        async (command, context): Promise<unknown> =>
          await simKms.listKeys(
            command as SimListKeysCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GetKeyPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simKms.getKeyPolicy(
            command as SimGetKeyPolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "PutKeyPolicyCommand",
        async (command, context): Promise<unknown> =>
          await simKms.putKeyPolicy(
            command as SimPutKeyPolicyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "EnableKeyCommand",
        async (command, context): Promise<unknown> =>
          await simKms.enableKey(
            command as SimEnableKeyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DisableKeyCommand",
        async (command, context): Promise<unknown> =>
          await simKms.disableKey(
            command as SimDisableKeyCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ScheduleKeyDeletionCommand",
        async (command, context): Promise<unknown> =>
          await simKms.scheduleKeyDeletion(
            command as SimScheduleKeyDeletionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CancelKeyDeletionCommand",
        async (command, context): Promise<unknown> =>
          await simKms.cancelKeyDeletion(
            command as SimCancelKeyDeletionCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "CreateAliasCommand",
        async (command, context): Promise<unknown> =>
          await simKms.createAlias(
            command as SimCreateAliasCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "ListAliasesCommand",
        async (command, context): Promise<unknown> =>
          await simKms.listAliases(
            command as SimListAliasesCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "EncryptCommand",
        async (command, context): Promise<unknown> =>
          await simKms.encrypt(
            command as SimEncryptCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "DecryptCommand",
        async (command, context): Promise<unknown> =>
          await simKms.decrypt(
            command as SimDecryptCommand,
            simSdkCallerOptions(context),
          ),
      ],
      [
        "GenerateDataKeyCommand",
        async (command, context): Promise<unknown> =>
          await simKms.generateDataKey(
            command as SimGenerateDataKeyCommand,
            simSdkCallerOptions(context),
          ),
      ],
    ]);
  }

  /**
   * The SDK Command names simulated KMS can handle.
   */
  supportedCommandNames(): readonly string[] {
    return this.routes.keys().toArray();
  }

  /**
   * Get the route for an SDK Command name, if simulated KMS supports it.
   */
  route(commandName: string): SimSdkCommandRoute | undefined {
    return this.routes.get(commandName);
  }
}

import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimKmsKeyStore } from "../../key/sim-kms-key-store.js";
import { SimKmsPendingWindow } from "./sim-kms-pending-window.js";
import type { SimKmsAuthorizer } from "../authorize/sim-kms-authorizer.js";
import type {
  SimCancelKeyDeletionCommand,
  SimCancelKeyDeletionCommandOutput,
  SimDisableKeyCommand,
  SimDisableKeyCommandOutput,
  SimEnableKeyCommand,
  SimEnableKeyCommandOutput,
  SimScheduleKeyDeletionCommand,
  SimScheduleKeyDeletionCommandOutput,
} from "./key.command.js";

interface SimKmsKeyLifecycleCommandsProperties {
  readonly keys: SimKmsKeyStore;
  readonly authorizer: SimKmsAuthorizer;
  readonly clock: SimClock;
}

interface SimKmsKeyLifecycleCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that move a simulated KMS key between lifecycle states.
 *
 * The state transitions themselves belong to SimKmsKey, which refuses the ones
 * its current state does not allow. These commands resolve the key, authorize
 * the caller and report the result.
 */
export class SimKmsKeyLifecycleCommands {
  private readonly keys: SimKmsKeyStore;
  private readonly authorizer: SimKmsAuthorizer;
  private readonly clock: SimClock;

  constructor(properties: SimKmsKeyLifecycleCommandsProperties) {
    this.keys = properties.keys;
    this.authorizer = properties.authorizer;
    this.clock = properties.clock;
  }

  /**
   * Enable a key.
   */
  enable(
    command: SimEnableKeyCommand,
    options?: SimKmsKeyLifecycleCommandOptions,
  ): SimEnableKeyCommandOutput {
    const key = this.keys.require(command.input.KeyId);
    this.authorizer.authorizeKey("kms:EnableKey", key, options?.caller);
    key.enable();

    return { $metadata: {} };
  }

  /**
   * Disable a key, leaving it present but unusable.
   */
  disable(
    command: SimDisableKeyCommand,
    options?: SimKmsKeyLifecycleCommandOptions,
  ): SimDisableKeyCommandOutput {
    const key = this.keys.require(command.input.KeyId);
    this.authorizer.authorizeKey("kms:DisableKey", key, options?.caller);
    key.disable();

    return { $metadata: {} };
  }

  /**
   * Schedule a key for deletion after a recovery window.
   *
   * The key stays in the store while it is pending deletion, because that is
   * what recoverable means: the key is still there, refusing to be used, until
   * the window runs out.
   */
  scheduleDeletion(
    command: SimScheduleKeyDeletionCommand,
    options?: SimKmsKeyLifecycleCommandOptions,
  ): SimScheduleKeyDeletionCommandOutput {
    const window = new SimKmsPendingWindow(command.input.PendingWindowInDays);
    const key = this.keys.require(command.input.KeyId);
    this.authorizer.authorizeKey(
      "kms:ScheduleKeyDeletion",
      key,
      options?.caller,
    );

    const deletionDate = window.deletionDateFrom(this.clock.now());
    key.scheduleDeletion(deletionDate);

    return {
      $metadata: {},
      KeyId: key.arn,
      DeletionDate: deletionDate,
      KeyState: key.keyState,
      PendingWindowInDays: window.days,
    };
  }

  /**
   * Cancel a scheduled deletion, leaving the key disabled.
   */
  cancelDeletion(
    command: SimCancelKeyDeletionCommand,
    options?: SimKmsKeyLifecycleCommandOptions,
  ): SimCancelKeyDeletionCommandOutput {
    const key = this.keys.require(command.input.KeyId);
    this.authorizer.authorizeKey("kms:CancelKeyDeletion", key, options?.caller);
    key.cancelDeletion();

    return { $metadata: {}, KeyId: key.arn };
  }
}

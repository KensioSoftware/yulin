import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimSecretsManagerDeletionSchedule } from "../../secret/sim-secrets-manager-deletion-schedule.js";
import type { SimSecretsManagerSecretExpiry } from "../../secret/sim-secrets-manager-secret-expiry.js";
import type { SimSecretsManagerSecretStore } from "../../secret/sim-secrets-manager-secret-store.js";
import type { SimSecretsManagerAuthorizer } from "../authorize/sim-secrets-manager-authorizer.js";
import type {
  SimDeleteSecretCommand,
  SimDeleteSecretCommandOutput,
  SimRestoreSecretCommand,
  SimRestoreSecretCommandOutput,
} from "./secret.command.js";

interface SimSecretsManagerLifecycleCommandsProperties {
  readonly secrets: SimSecretsManagerSecretStore;
  readonly expiry: SimSecretsManagerSecretExpiry;
  readonly authorizer: SimSecretsManagerAuthorizer;
  readonly clock: SimClock;
}

interface SimSecretsManagerLifecycleCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that delete a simulated secret and take it back.
 *
 * Deletion is the part of Secrets Manager most worth simulating properly,
 * because a scheduled secret still holds its name. Redeploying a stack that
 * deleted a secret is where that bites on real AWS, and it only reproduces
 * here if the recovery window really has to elapse.
 */
export class SimSecretsManagerLifecycleCommands {
  private readonly secrets: SimSecretsManagerSecretStore;
  private readonly expiry: SimSecretsManagerSecretExpiry;
  private readonly authorizer: SimSecretsManagerAuthorizer;
  private readonly clock: SimClock;

  constructor(properties: SimSecretsManagerLifecycleCommandsProperties) {
    this.secrets = properties.secrets;
    this.expiry = properties.expiry;
    this.authorizer = properties.authorizer;
    this.clock = properties.clock;
  }

  /**
   * Schedule a secret for deletion, or delete it outright.
   *
   * The secret stays in the store while it is scheduled, because that is what
   * recoverable means: it is still there, refusing to be read or written, and
   * still holding its name, until the window runs out.
   */
  delete(
    command: SimDeleteSecretCommand,
    options?: SimSecretsManagerLifecycleCommandOptions,
  ): SimDeleteSecretCommandOutput {
    const schedule = new SimSecretsManagerDeletionSchedule(command.input);
    const secret = this.secrets.require(command.input.SecretId);

    this.authorizer.authorizeSecret(
      "secretsmanager:DeleteSecret",
      secret,
      options?.caller,
    );

    const deletionDate = schedule.deletionDateFrom(this.clock.now());

    if (schedule.isImmediate) {
      this.secrets.remove(secret);
    } else {
      secret.scheduleDeletion(deletionDate);
      this.expiry.scheduleRemoval(secret, deletionDate);
    }

    return {
      $metadata: {},
      ARN: secret.arn.value,
      Name: secret.name,
      DeletionDate: deletionDate,
    };
  }

  /**
   * Cancel a scheduled deletion, leaving the secret as it was.
   */
  restore(
    command: SimRestoreSecretCommand,
    options?: SimSecretsManagerLifecycleCommandOptions,
  ): SimRestoreSecretCommandOutput {
    const secret = this.secrets.require(command.input.SecretId);

    this.authorizer.authorizeSecret(
      "secretsmanager:RestoreSecret",
      secret,
      options?.caller,
    );
    secret.cancelDeletion();

    return {
      $metadata: {},
      ARN: secret.arn.value,
      Name: secret.name,
    };
  }
}

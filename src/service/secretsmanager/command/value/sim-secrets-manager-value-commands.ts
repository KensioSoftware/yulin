import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimSecretsManagerSecretStore } from "../../secret/sim-secrets-manager-secret-store.js";
import { SimSecretsManagerSecretValue } from "../../secret/sim-secrets-manager-secret-value.js";
import { SimSecretsManagerVersionSelector } from "../../secret/sim-secrets-manager-version-selector.js";
import type { SimSecretsManagerVersionWriter } from "../../secret/sim-secrets-manager-version-writer.js";
import type { SimSecretsManagerAuthorizer } from "../authorize/sim-secrets-manager-authorizer.js";
import type {
  SimGetSecretValueCommand,
  SimGetSecretValueCommandOutput,
  SimPutSecretValueCommand,
  SimPutSecretValueCommandOutput,
} from "./value.command.js";

interface SimSecretsManagerValueCommandsProperties {
  readonly secrets: SimSecretsManagerSecretStore;
  readonly versionWriter: SimSecretsManagerVersionWriter;
  readonly authorizer: SimSecretsManagerAuthorizer;
}

interface SimSecretsManagerValueCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that read and write a simulated secret's value.
 *
 * These are the two operations application code actually makes: a handler
 * fetching a database password on cold start, and whatever put it there.
 */
export class SimSecretsManagerValueCommands {
  private readonly secrets: SimSecretsManagerSecretStore;
  private readonly versionWriter: SimSecretsManagerVersionWriter;
  private readonly authorizer: SimSecretsManagerAuthorizer;
  private readonly versionSelector = new SimSecretsManagerVersionSelector();

  constructor(properties: SimSecretsManagerValueCommandsProperties) {
    this.secrets = properties.secrets;
    this.versionWriter = properties.versionWriter;
    this.authorizer = properties.authorizer;
  }

  /**
   * Read a secret's value, defaulting to the version labelled AWSCURRENT.
   */
  get(
    command: SimGetSecretValueCommand,
    options?: SimSecretsManagerValueCommandOptions,
  ): SimGetSecretValueCommandOutput {
    const { input } = command;
    const secret = this.secrets.require(input.SecretId);

    this.authorizer.authorizeSecret(
      "secretsmanager:GetSecretValue",
      secret,
      options?.caller,
    );
    secret.requireNotScheduledForDeletion();

    const version = this.versionSelector.select(secret, input);

    return {
      $metadata: {},
      ARN: secret.arn.value,
      Name: secret.name,
      VersionId: version.versionId,
      SecretString: version.value.secretString,
      SecretBinary: version.value.secretBinary,
      VersionStages: version.stages,
      CreatedDate: version.createdDate,
    };
  }

  /**
   * Write a new version of a secret's value.
   *
   * The new version becomes AWSCURRENT unless VersionStages says otherwise,
   * and the version that was current becomes AWSPREVIOUS.
   */
  put(
    command: SimPutSecretValueCommand,
    options?: SimSecretsManagerValueCommandOptions,
  ): SimPutSecretValueCommandOutput {
    const { input } = command;
    const secret = this.secrets.require(input.SecretId);

    this.authorizer.authorizeSecret(
      "secretsmanager:PutSecretValue",
      secret,
      options?.caller,
    );
    secret.requireNotScheduledForDeletion();

    const value = SimSecretsManagerSecretValue.required(input);
    const version = this.versionWriter.write(secret, value, input);

    return {
      $metadata: {},
      ARN: secret.arn.value,
      Name: secret.name,
      VersionId: version.versionId,
      VersionStages: version.stages,
    };
  }
}

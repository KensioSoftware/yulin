import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimSecretsManagerSecret } from "../../secret/sim-secrets-manager-secret.js";
import type { SimSecretsManagerSecretStore } from "../../secret/sim-secrets-manager-secret-store.js";
import { SimSecretsManagerSecretValue } from "../../secret/sim-secrets-manager-secret-value.js";
import type { SimSecretsManagerVersionWriter } from "../../secret/sim-secrets-manager-version-writer.js";
import type { SimSecretsManagerAuthorizer } from "../authorize/sim-secrets-manager-authorizer.js";
import { SimSecretsManagerMetadataUpdate } from "./sim-secrets-manager-metadata-update.js";
import type {
  SimUpdateSecretCommand,
  SimUpdateSecretCommandInput,
  SimUpdateSecretCommandOutput,
} from "./secret.command.js";

interface SimSecretsManagerUpdateSecretProperties {
  readonly secrets: SimSecretsManagerSecretStore;
  readonly versionWriter: SimSecretsManagerVersionWriter;
  readonly authorizer: SimSecretsManagerAuthorizer;
  readonly clock: SimClock;
}

interface SimSecretsManagerUpdateSecretOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The UpdateSecret command.
 *
 * This is the one operation that can change a secret's metadata and its value
 * in the same request, and either part is optional, so it is kept apart from
 * the commands that only do one of those.
 */
export class SimSecretsManagerUpdateSecret {
  private readonly secrets: SimSecretsManagerSecretStore;
  private readonly versionWriter: SimSecretsManagerVersionWriter;
  private readonly authorizer: SimSecretsManagerAuthorizer;
  private readonly metadata: SimSecretsManagerMetadataUpdate;

  constructor(properties: SimSecretsManagerUpdateSecretProperties) {
    this.secrets = properties.secrets;
    this.versionWriter = properties.versionWriter;
    this.authorizer = properties.authorizer;
    this.metadata = new SimSecretsManagerMetadataUpdate({
      clock: properties.clock,
    });
  }

  /**
   * Update a secret's metadata, its value, or both.
   *
   * Supplying a value writes a new version and makes it current, the same as
   * PutSecretValue does.
   */
  async handle(
    command: SimUpdateSecretCommand,
    options?: SimSecretsManagerUpdateSecretOptions,
  ): Promise<SimUpdateSecretCommandOutput> {
    const { input } = command;
    const secret = this.secrets.require(input.SecretId);

    this.authorizer.authorizeSecret(
      "secretsmanager:UpdateSecret",
      secret,
      options?.caller,
    );
    secret.requireNotScheduledForDeletion();

    const value = SimSecretsManagerSecretValue.optional(input);

    // The version is written first because writing it can still fail, on a
    // client request token already used for a different value. Applying the
    // metadata first would leave the secret half updated by a request that
    // then reported an error.
    const versionId = await this.writtenVersionId(
      secret,
      value,
      input,
      options?.caller,
    );
    this.metadata.apply(secret, input);

    return {
      $metadata: {},
      ARN: secret.arn.value,
      Name: secret.name,
      VersionId: versionId,
    };
  }

  /**
   * Write the new version, if the request carried a value.
   *
   * A request changing the key and the value together encrypts the new version
   * under the new key, as real AWS does. The versions already written keep the
   * key they were made with, so they stay readable.
   */
  private async writtenVersionId(
    secret: SimSecretsManagerSecret,
    value: SimSecretsManagerSecretValue | undefined,
    input: SimUpdateSecretCommandInput,
    caller: SimAwsCaller | undefined,
  ): Promise<string | undefined> {
    if (value === undefined) {
      return undefined;
    }

    const version = await this.versionWriter.write({
      secret,
      value,
      input,
      keyId: input.KmsKeyId ?? secret.kmsKeyId,
      caller,
    });

    return version.versionId;
  }
}

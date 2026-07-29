import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimSecretsManagerSecretFactory } from "../../secret/sim-secrets-manager-secret-factory.js";
import type { SimSecretsManagerSecretStore } from "../../secret/sim-secrets-manager-secret-store.js";
import { SimSecretsManagerSecretValue } from "../../secret/sim-secrets-manager-secret-value.js";
import type { SimSecretsManagerVersionWriter } from "../../secret/sim-secrets-manager-version-writer.js";
import type { SimSecretsManagerAuthorizer } from "../authorize/sim-secrets-manager-authorizer.js";
import { SimSecretsManagerSecretDetail } from "./sim-secrets-manager-secret-detail.js";
import type {
  SimCreateSecretCommand,
  SimCreateSecretCommandOutput,
  SimDescribeSecretCommand,
  SimDescribeSecretCommandOutput,
} from "./secret.command.js";

interface SimSecretsManagerSecretCommandsProperties {
  readonly secrets: SimSecretsManagerSecretStore;
  readonly secretFactory: SimSecretsManagerSecretFactory;
  readonly versionWriter: SimSecretsManagerVersionWriter;
  readonly authorizer: SimSecretsManagerAuthorizer;
}

interface SimSecretsManagerCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that create and describe a simulated secret.
 *
 * The interesting rules live with the collaborators these delegate to: name
 * validation and ARN suffixing in the secret factory, staging labels in the
 * version writer, and name availability in the store.
 */
export class SimSecretsManagerSecretCommands {
  private readonly secrets: SimSecretsManagerSecretStore;
  private readonly secretFactory: SimSecretsManagerSecretFactory;
  private readonly versionWriter: SimSecretsManagerVersionWriter;
  private readonly authorizer: SimSecretsManagerAuthorizer;
  private readonly detail = new SimSecretsManagerSecretDetail();

  constructor(properties: SimSecretsManagerSecretCommandsProperties) {
    this.secrets = properties.secrets;
    this.secretFactory = properties.secretFactory;
    this.versionWriter = properties.versionWriter;
    this.authorizer = properties.authorizer;
  }

  /**
   * Create a secret with its first version.
   *
   * Authorization happens against the ARN the secret is about to get, suffix
   * and all, so a policy allowing `secretsmanager:CreateSecret` on a bare name
   * fails here just as it would on real AWS.
   */
  async create(
    command: SimCreateSecretCommand,
    options?: SimSecretsManagerCommandOptions,
  ): Promise<SimCreateSecretCommandOutput> {
    const { input } = command;
    const secret = this.secretFactory.make({
      name: input.Name,
      description: input.Description,
      kmsKeyId: input.KmsKeyId,
      tags: input.Tags,
    });
    const value = SimSecretsManagerSecretValue.required(input);

    this.authorizer.authorizeSecret(
      "secretsmanager:CreateSecret",
      secret,
      options?.caller,
    );
    // The name is claimed for the whole of the create, because the first
    // version is encrypted through KMS in between: another create of the same
    // name is refused rather than overwriting this one. The secret itself is
    // stored only once that version exists, so a create refused for a key it
    // cannot use leaves nothing behind.
    this.secrets.claimName(secret.name);

    try {
      const version = await this.versionWriter.write({
        secret,
        value,
        input,
        keyId: secret.kmsKeyId,
        caller: options?.caller,
      });

      this.secrets.add(secret);

      return {
        $metadata: {},
        ARN: secret.arn.value,
        Name: secret.name,
        VersionId: version.versionId,
      };
    } finally {
      this.secrets.releaseName(secret.name);
    }
  }

  /**
   * Describe a secret's metadata, including the versions and their staging
   * labels.
   *
   * A secret scheduled for deletion is still describable, and reports the date
   * its recovery window runs out as DeletedDate.
   */
  describe(
    command: SimDescribeSecretCommand,
    options?: SimSecretsManagerCommandOptions,
  ): SimDescribeSecretCommandOutput {
    const secret = this.secrets.require(command.input.SecretId);

    this.authorizer.authorizeSecret(
      "secretsmanager:DescribeSecret",
      secret,
      options?.caller,
    );

    return { ...this.detail.describe(secret), $metadata: {} };
  }
}

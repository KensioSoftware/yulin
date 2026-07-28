import type { SimSecretsManagerSecret } from "../../secret/sim-secrets-manager-secret.js";
import type {
  SimDescribeSecretCommandOutput,
  SimSecretsManagerSecretListEntry,
} from "./secret.command.js";

type SimSecretsManagerSecretDescription = Omit<
  SimDescribeSecretCommandOutput,
  "$metadata"
>;

/**
 * Converts a stored secret into the metadata Secrets Manager reports for it.
 *
 * DescribeSecret and ListSecrets report almost the same fields under two
 * slightly different names, so building both here keeps them agreeing with
 * each other.
 *
 * Rotation is always reported as disabled: RotateSecret and the rotation
 * Lambda protocol are not simulated, so no secret in this simulation can be
 * rotating.
 */
export class SimSecretsManagerSecretDetail {
  /**
   * The fields DescribeSecret reports for a secret.
   */
  describe(
    secret: SimSecretsManagerSecret,
  ): SimSecretsManagerSecretDescription {
    return {
      ARN: secret.arn.value,
      Name: secret.name,
      Description: secret.description,
      KmsKeyId: secret.kmsKeyId,
      RotationEnabled: false,
      CreatedDate: secret.createdDate,
      LastChangedDate: secret.lastChangedDate,
      DeletedDate: secret.deletionDate,
      Tags: secret.tags,
      VersionIdsToStages: secret.versions.versionIdsToStages(),
    };
  }

  /**
   * The fields ListSecrets reports for a secret.
   */
  listEntry(secret: SimSecretsManagerSecret): SimSecretsManagerSecretListEntry {
    const { VersionIdsToStages: versionsToStages, ...shared } =
      this.describe(secret);

    return { ...shared, SecretVersionsToStages: versionsToStages };
  }
}

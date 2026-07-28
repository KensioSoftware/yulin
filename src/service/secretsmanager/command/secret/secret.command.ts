import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimSecretsManagerTag } from "../../secret/sim-secrets-manager-secret.js";

/**
 * Minimal structural sim Secrets Manager CreateSecret command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/secrets-manager/command/CreateSecretCommand/
 */
export interface SimCreateSecretCommand {
  readonly input: SimCreateSecretCommandInput;
}

export interface SimCreateSecretCommandInput {
  readonly Name?: string | undefined;
  readonly Description?: string | undefined;
  readonly KmsKeyId?: string | undefined;
  readonly SecretString?: string | undefined;
  readonly SecretBinary?: Uint8Array | undefined;
  readonly ClientRequestToken?: string | undefined;
  readonly Tags?: readonly SimSecretsManagerTag[] | undefined;
}

export interface SimCreateSecretCommandOutput {
  readonly ARN?: string | undefined;
  readonly Name?: string | undefined;
  readonly VersionId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Secrets Manager DescribeSecret command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/secrets-manager/command/DescribeSecretCommand/
 */
export interface SimDescribeSecretCommand {
  readonly input: SimDescribeSecretCommandInput;
}

export interface SimDescribeSecretCommandInput {
  readonly SecretId?: string | undefined;
}

export interface SimDescribeSecretCommandOutput {
  readonly ARN?: string | undefined;
  readonly Name?: string | undefined;
  readonly Description?: string | undefined;
  readonly KmsKeyId?: string | undefined;
  readonly RotationEnabled?: boolean | undefined;
  readonly CreatedDate?: Date | undefined;
  readonly LastChangedDate?: Date | undefined;
  readonly DeletedDate?: Date | undefined;
  readonly Tags?: readonly SimSecretsManagerTag[] | undefined;
  readonly VersionIdsToStages?: Record<string, string[]> | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Secrets Manager UpdateSecret command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/secrets-manager/command/UpdateSecretCommand/
 */
export interface SimUpdateSecretCommand {
  readonly input: SimUpdateSecretCommandInput;
}

export interface SimUpdateSecretCommandInput {
  readonly SecretId?: string | undefined;
  readonly Description?: string | undefined;
  readonly KmsKeyId?: string | undefined;
  readonly SecretString?: string | undefined;
  readonly SecretBinary?: Uint8Array | undefined;
  readonly ClientRequestToken?: string | undefined;
}

export interface SimUpdateSecretCommandOutput {
  readonly ARN?: string | undefined;
  readonly Name?: string | undefined;
  readonly VersionId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Secrets Manager DeleteSecret command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/secrets-manager/command/DeleteSecretCommand/
 */
export interface SimDeleteSecretCommand {
  readonly input: SimDeleteSecretCommandInput;
}

export interface SimDeleteSecretCommandInput {
  readonly SecretId?: string | undefined;
  readonly RecoveryWindowInDays?: number | undefined;
  readonly ForceDeleteWithoutRecovery?: boolean | undefined;
}

export interface SimDeleteSecretCommandOutput {
  readonly ARN?: string | undefined;
  readonly Name?: string | undefined;
  readonly DeletionDate?: Date | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Secrets Manager RestoreSecret command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/secrets-manager/command/RestoreSecretCommand/
 */
export interface SimRestoreSecretCommand {
  readonly input: SimRestoreSecretCommandInput;
}

export interface SimRestoreSecretCommandInput {
  readonly SecretId?: string | undefined;
}

export interface SimRestoreSecretCommandOutput {
  readonly ARN?: string | undefined;
  readonly Name?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Secrets Manager ListSecrets command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/secrets-manager/command/ListSecretsCommand/
 */
export interface SimListSecretsCommand {
  readonly input?: SimListSecretsCommandInput | undefined;
}

export interface SimListSecretsFilter {
  readonly Key?: string | undefined;
  readonly Values?: readonly string[] | undefined;
}

export interface SimListSecretsCommandInput {
  readonly IncludePlannedDeletion?: boolean | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
  readonly Filters?: readonly SimListSecretsFilter[] | undefined;
  readonly SortOrder?: string | undefined;
  readonly SortBy?: string | undefined;
}

export interface SimSecretsManagerSecretListEntry {
  readonly ARN?: string | undefined;
  readonly Name?: string | undefined;
  readonly Description?: string | undefined;
  readonly KmsKeyId?: string | undefined;
  readonly RotationEnabled?: boolean | undefined;
  readonly CreatedDate?: Date | undefined;
  readonly LastChangedDate?: Date | undefined;
  readonly DeletedDate?: Date | undefined;
  readonly Tags?: readonly SimSecretsManagerTag[] | undefined;
  readonly SecretVersionsToStages?: Record<string, string[]> | undefined;
}

export interface SimListSecretsCommandOutput {
  readonly SecretList?: readonly SimSecretsManagerSecretListEntry[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

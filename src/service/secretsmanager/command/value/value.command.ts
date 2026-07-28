import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Secrets Manager GetSecretValue command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/secrets-manager/command/GetSecretValueCommand/
 */
export interface SimGetSecretValueCommand {
  readonly input: SimGetSecretValueCommandInput;
}

export interface SimGetSecretValueCommandInput {
  readonly SecretId?: string | undefined;
  readonly VersionId?: string | undefined;
  readonly VersionStage?: string | undefined;
}

export interface SimGetSecretValueCommandOutput {
  readonly ARN?: string | undefined;
  readonly Name?: string | undefined;
  readonly VersionId?: string | undefined;
  readonly SecretString?: string | undefined;
  readonly SecretBinary?: Uint8Array | undefined;
  readonly VersionStages?: readonly string[] | undefined;
  readonly CreatedDate?: Date | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Secrets Manager PutSecretValue command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/secrets-manager/command/PutSecretValueCommand/
 */
export interface SimPutSecretValueCommand {
  readonly input: SimPutSecretValueCommandInput;
}

export interface SimPutSecretValueCommandInput {
  readonly SecretId?: string | undefined;
  readonly SecretString?: string | undefined;
  readonly SecretBinary?: Uint8Array | undefined;
  readonly ClientRequestToken?: string | undefined;
  readonly VersionStages?: readonly string[] | undefined;
}

export interface SimPutSecretValueCommandOutput {
  readonly ARN?: string | undefined;
  readonly Name?: string | undefined;
  readonly VersionId?: string | undefined;
  readonly VersionStages?: readonly string[] | undefined;
  readonly $metadata: SimResponseMetadata;
}

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim STS AssumeRole command.
 */
export interface SimAssumeRoleCommand {
  readonly input: SimAssumeRoleCommandInput;
}

/**
 * Minimal structural sim STS AssumeRole input.
 *
 * The optional properties reflect that runtime validation remains the
 * responsibility of the command handler.
 */
export interface SimAssumeRoleCommandInput {
  readonly RoleArn?: string | undefined;
  readonly RoleSessionName?: string | undefined;
  readonly DurationSeconds?: number | undefined;
  readonly ExternalId?: string | undefined;
}

/**
 * Minimal structural sim STS AssumeRole output.
 */
export interface SimAssumeRoleCommandOutput {
  readonly Credentials?: SimStsCredentials | undefined;
  readonly AssumedRoleUser?: SimStsAssumedRoleUser | undefined;
  readonly SourceIdentity?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Temporary credentials issued for an assumed-role session.
 */
export interface SimStsCredentials {
  readonly AccessKeyId?: string | undefined;
  readonly SecretAccessKey?: string | undefined;
  readonly SessionToken?: string | undefined;
  readonly Expiration?: Date | undefined;
}

/**
 * Identity associated with the issued temporary credentials.
 */
export interface SimStsAssumedRoleUser {
  readonly AssumedRoleId?: string | undefined;
  readonly Arn?: string | undefined;
}

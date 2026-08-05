import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim KMS CreateAlias command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/CreateAliasCommand/
 */
export interface SimCreateAliasCommand {
  readonly input: SimCreateAliasCommandInput;
}

export interface SimCreateAliasCommandInput {
  readonly AliasName?: string | undefined;
  readonly TargetKeyId?: string | undefined;
}

export interface SimCreateAliasCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS DeleteAlias command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/DeleteAliasCommand/
 */
export interface SimDeleteAliasCommand {
  readonly input: SimDeleteAliasCommandInput;
}

export interface SimDeleteAliasCommandInput {
  readonly AliasName?: string | undefined;
}

export interface SimDeleteAliasCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim KMS ListAliases command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/kms/command/ListAliasesCommand/
 */
export interface SimListAliasesCommand {
  readonly input?: SimListAliasesCommandInput | undefined;
}

export interface SimListAliasesCommandInput {
  /**
   * Narrows the result to the aliases of one key. Real KMS returns every alias
   * in the Region when this is omitted.
   */
  readonly KeyId?: string | undefined;

  readonly Limit?: number | undefined;
}

export interface SimListAliasesCommandEntry {
  readonly AliasName: string;
  readonly AliasArn: string;
  readonly TargetKeyId: string;
}

export interface SimListAliasesCommandOutput {
  readonly Aliases?: readonly SimListAliasesCommandEntry[] | undefined;
  readonly Truncated?: boolean | undefined;
  readonly $metadata: SimResponseMetadata;
}

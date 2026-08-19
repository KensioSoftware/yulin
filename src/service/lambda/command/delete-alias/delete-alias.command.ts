/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/DeleteAliasCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Lambda DeleteAlias command.
 */
export interface SimDeleteAliasCommand {
  readonly input: SimDeleteAliasCommandInput;
}

/**
 * Minimal structural sim Lambda DeleteAlias input.
 */
export interface SimDeleteAliasCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Name?: string | undefined;
}

/**
 * Minimal structural sim Lambda DeleteAlias output.
 */
export interface SimDeleteAliasCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

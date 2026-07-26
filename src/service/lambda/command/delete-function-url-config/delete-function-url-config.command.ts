/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/DeleteFunctionUrlConfigCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Lambda DeleteFunctionUrlConfig command.
 */
export interface SimDeleteFunctionUrlConfigCommand {
  readonly input: SimDeleteFunctionUrlConfigCommandInput;
}

/**
 * Minimal structural sim Lambda DeleteFunctionUrlConfig input.
 */
export interface SimDeleteFunctionUrlConfigCommandInput {
  readonly FunctionName?: string | undefined;
}

/**
 * Minimal structural sim Lambda DeleteFunctionUrlConfig output.
 *
 * Real Lambda answers this operation with no content beyond the response
 * metadata.
 */
export interface SimDeleteFunctionUrlConfigCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

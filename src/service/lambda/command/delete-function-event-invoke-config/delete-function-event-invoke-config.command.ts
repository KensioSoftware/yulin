/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/DeleteFunctionEventInvokeConfigCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Lambda DeleteFunctionEventInvokeConfig command.
 */
export interface SimDeleteFunctionEventInvokeConfigCommand {
  readonly input: SimDeleteFunctionEventInvokeConfigCommandInput;
}

/**
 * Minimal structural sim Lambda DeleteFunctionEventInvokeConfig input.
 */
export interface SimDeleteFunctionEventInvokeConfigCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Qualifier?: string | undefined;
}

/**
 * Minimal structural sim Lambda DeleteFunctionEventInvokeConfig output.
 */
export interface SimDeleteFunctionEventInvokeConfigCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetFunctionEventInvokeConfigCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaEventInvokeConfiguration } from "../../function/event-invoke/sim-lambda-event-invoke-config.js";

/**
 * Minimal structural sim Lambda GetFunctionEventInvokeConfig command.
 */
export interface SimGetFunctionEventInvokeConfigCommand {
  readonly input: SimGetFunctionEventInvokeConfigCommandInput;
}

/**
 * Minimal structural sim Lambda GetFunctionEventInvokeConfig input.
 */
export interface SimGetFunctionEventInvokeConfigCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Qualifier?: string | undefined;
}

/**
 * Minimal structural sim Lambda GetFunctionEventInvokeConfig output.
 */
export interface SimGetFunctionEventInvokeConfigCommandOutput extends SimLambdaEventInvokeConfiguration {
  readonly $metadata: SimResponseMetadata;
}

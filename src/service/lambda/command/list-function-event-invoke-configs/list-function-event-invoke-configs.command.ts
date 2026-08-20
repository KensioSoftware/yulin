/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/ListFunctionEventInvokeConfigsCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaEventInvokeConfiguration } from "../../function/event-invoke/sim-lambda-event-invoke-config.js";

/**
 * Minimal structural sim Lambda ListFunctionEventInvokeConfigs command.
 */
export interface SimListFunctionEventInvokeConfigsCommand {
  readonly input: SimListFunctionEventInvokeConfigsCommandInput;
}

/**
 * Minimal structural sim Lambda ListFunctionEventInvokeConfigs input.
 */
export interface SimListFunctionEventInvokeConfigsCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Marker?: string | undefined;
  readonly MaxItems?: number | undefined;
}

/**
 * Minimal structural sim Lambda ListFunctionEventInvokeConfigs output.
 */
export interface SimListFunctionEventInvokeConfigsCommandOutput {
  readonly FunctionEventInvokeConfigs: readonly SimLambdaEventInvokeConfiguration[];
  readonly NextMarker?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

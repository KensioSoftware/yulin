/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/PutFunctionEventInvokeConfigCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimLambdaDestinationConfiguration,
  SimLambdaEventInvokeConfiguration,
} from "../../function/event-invoke/sim-lambda-event-invoke-config.js";

/**
 * Minimal structural sim Lambda PutFunctionEventInvokeConfig command.
 */
export interface SimPutFunctionEventInvokeConfigCommand {
  readonly input: SimPutFunctionEventInvokeConfigCommandInput;
}

/**
 * Minimal structural sim Lambda PutFunctionEventInvokeConfig input.
 *
 * A setting left out goes back to its default, since this command writes the
 * whole config.
 */
export interface SimPutFunctionEventInvokeConfigCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Qualifier?: string | undefined;
  readonly MaximumRetryAttempts?: number | undefined;
  readonly MaximumEventAgeInSeconds?: number | undefined;
  readonly DestinationConfig?: SimLambdaDestinationConfiguration | undefined;
}

/**
 * Minimal structural sim Lambda PutFunctionEventInvokeConfig output.
 */
export interface SimPutFunctionEventInvokeConfigCommandOutput extends SimLambdaEventInvokeConfiguration {
  readonly $metadata: SimResponseMetadata;
}

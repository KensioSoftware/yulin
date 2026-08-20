/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateFunctionEventInvokeConfigCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type {
  SimLambdaDestinationConfiguration,
  SimLambdaEventInvokeConfiguration,
} from "../../function/event-invoke/sim-lambda-event-invoke-config.js";

/**
 * Minimal structural sim Lambda UpdateFunctionEventInvokeConfig command.
 */
export interface SimUpdateFunctionEventInvokeConfigCommand {
  readonly input: SimUpdateFunctionEventInvokeConfigCommandInput;
}

/**
 * Minimal structural sim Lambda UpdateFunctionEventInvokeConfig input.
 *
 * A setting left out keeps the value the config already holds.
 */
export interface SimUpdateFunctionEventInvokeConfigCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Qualifier?: string | undefined;
  readonly MaximumRetryAttempts?: number | undefined;
  readonly MaximumEventAgeInSeconds?: number | undefined;
  readonly DestinationConfig?: SimLambdaDestinationConfiguration | undefined;
}

/**
 * Minimal structural sim Lambda UpdateFunctionEventInvokeConfig output.
 */
export interface SimUpdateFunctionEventInvokeConfigCommandOutput extends SimLambdaEventInvokeConfiguration {
  readonly $metadata: SimResponseMetadata;
}

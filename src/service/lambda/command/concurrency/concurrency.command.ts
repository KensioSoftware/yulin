/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/PutFunctionConcurrencyCommand/
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetFunctionConcurrencyCommand/
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/DeleteFunctionConcurrencyCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Lambda PutFunctionConcurrency command.
 */
export interface SimPutFunctionConcurrencyCommand {
  readonly input: SimPutFunctionConcurrencyCommandInput;
}

/**
 * Minimal structural sim Lambda PutFunctionConcurrency input.
 */
export interface SimPutFunctionConcurrencyCommandInput {
  readonly FunctionName?: string | undefined;
  readonly ReservedConcurrentExecutions?: number | undefined;
}

/**
 * Minimal structural sim Lambda PutFunctionConcurrency output.
 */
export interface SimPutFunctionConcurrencyCommandOutput {
  readonly $metadata: SimResponseMetadata;
  readonly ReservedConcurrentExecutions: number;
}

/**
 * Minimal structural sim Lambda GetFunctionConcurrency command.
 */
export interface SimGetFunctionConcurrencyCommand {
  readonly input: SimFunctionConcurrencyCommandInput;
}

/**
 * Minimal structural input of the concurrency commands naming only a
 * function.
 */
export interface SimFunctionConcurrencyCommandInput {
  readonly FunctionName?: string | undefined;
}

/**
 * Minimal structural sim Lambda GetFunctionConcurrency output. A function
 * with nothing reserved reports no `ReservedConcurrentExecutions`.
 */
export interface SimGetFunctionConcurrencyCommandOutput {
  readonly $metadata: SimResponseMetadata;
  readonly ReservedConcurrentExecutions?: number | undefined;
}

/**
 * Minimal structural sim Lambda DeleteFunctionConcurrency command.
 */
export interface SimDeleteFunctionConcurrencyCommand {
  readonly input: SimFunctionConcurrencyCommandInput;
}

/**
 * Minimal structural sim Lambda DeleteFunctionConcurrency output.
 */
export interface SimDeleteFunctionConcurrencyCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

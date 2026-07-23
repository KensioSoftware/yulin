/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/CreateFunctionCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionConfiguration } from "../../function/sim-lambda-function.js";

/**
 * Minimal structural sim Lambda CreateFunction command.
 */
export interface SimCreateFunctionCommand {
  readonly input: SimCreateFunctionCommandInput;
}

/**
 * Minimal structural sim Lambda function code input.
 */
export interface SimLambdaFunctionCode {
  ZipFile?: Uint8Array | undefined;
}

/**
 * Minimal structural sim Lambda CreateFunction input.
 */
export interface SimCreateFunctionCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Role?: string | undefined;
  readonly Code?: SimLambdaFunctionCode | undefined;
  readonly Handler?: string | undefined;
  readonly Runtime?: string | undefined;
  readonly Description?: string | undefined;
  readonly Timeout?: number | undefined;
  readonly MemorySize?: number | undefined;
}

/**
 * Minimal structural sim Lambda CreateFunction output.
 */
export interface SimCreateFunctionCommandOutput extends SimLambdaFunctionConfiguration {
  readonly $metadata: SimResponseMetadata;
}

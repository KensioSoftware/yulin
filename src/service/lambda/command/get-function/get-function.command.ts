/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetFunctionCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionConfiguration } from "../../function/sim-lambda-function-configuration.js";

/**
 * Minimal structural sim Lambda GetFunction command.
 */
export interface SimGetFunctionCommand {
  readonly input: SimGetFunctionCommandInput;
}

/**
 * Minimal structural sim Lambda GetFunction input.
 */
export interface SimGetFunctionCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Qualifier?: string | undefined;
}

/**
 * Minimal structural sim Lambda GetFunction output.
 */
export interface SimGetFunctionCommandOutput {
  readonly $metadata: SimResponseMetadata;
  Configuration: SimLambdaFunctionConfiguration;
}

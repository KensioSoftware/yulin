/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetFunctionConfigurationCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionConfiguration } from "../../function/sim-lambda-function-configuration.js";

/**
 * Minimal structural sim Lambda GetFunctionConfiguration command.
 */
export interface SimGetFunctionConfigurationCommand {
  readonly input: SimGetFunctionConfigurationCommandInput;
}

/**
 * Minimal structural sim Lambda GetFunctionConfiguration input.
 */
export interface SimGetFunctionConfigurationCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Qualifier?: string | undefined;
}

/**
 * Minimal structural sim Lambda GetFunctionConfiguration output.
 *
 * The configuration GetFunction nests under `Configuration`, at the top level.
 */
export interface SimGetFunctionConfigurationCommandOutput extends SimLambdaFunctionConfiguration {
  readonly $metadata: SimResponseMetadata;
}

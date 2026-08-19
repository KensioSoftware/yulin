/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/ListVersionsByFunctionCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionConfiguration } from "../../function/sim-lambda-function-configuration.js";

/**
 * Minimal structural sim Lambda ListVersionsByFunction command.
 */
export interface SimListVersionsByFunctionCommand {
  readonly input: SimListVersionsByFunctionCommandInput;
}

/**
 * Minimal structural sim Lambda ListVersionsByFunction input.
 *
 * Every version is reported in one answer, so the `Marker` and `MaxItems`
 * real Lambda pages with are left out.
 */
export interface SimListVersionsByFunctionCommandInput {
  readonly FunctionName?: string | undefined;
}

/**
 * Minimal structural sim Lambda ListVersionsByFunction output.
 */
export interface SimListVersionsByFunctionCommandOutput {
  readonly $metadata: SimResponseMetadata;
  Versions: SimLambdaFunctionConfiguration[];
}

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
 * One answer carries at most 50 versions, as on real Lambda, and
 * `NextMarker` reaches the rest.
 */
export interface SimListVersionsByFunctionCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Marker?: string | undefined;
  readonly MaxItems?: number | undefined;
}

/**
 * Minimal structural sim Lambda ListVersionsByFunction output.
 */
export interface SimListVersionsByFunctionCommandOutput {
  readonly $metadata: SimResponseMetadata;
  Versions: SimLambdaFunctionConfiguration[];
  NextMarker?: string | undefined;
}

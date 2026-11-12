/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/ListFunctionsCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionConfiguration } from "../../function/sim-lambda-function-configuration.js";

/**
 * Minimal structural sim Lambda ListFunctions command.
 */
export interface SimListFunctionsCommand {
  readonly input: SimListFunctionsCommandInput;
}

/**
 * Minimal structural sim Lambda ListFunctions input.
 *
 * `FunctionVersion: "ALL"` adds each function's published versions to the
 * listing, and anything else lists the functions themselves. One answer
 * carries at most 50 of them, as on real Lambda, and `NextMarker` reaches the
 * rest.
 *
 * `MasterRegion` reaches another Region's Lambda@Edge replicas, which this
 * simulation does not have, so it is left out rather than accepted and
 * ignored.
 */
export interface SimListFunctionsCommandInput {
  readonly FunctionVersion?: string | undefined;
  readonly Marker?: string | undefined;
  readonly MaxItems?: number | undefined;
}

/**
 * Minimal structural sim Lambda ListFunctions output.
 */
export interface SimListFunctionsCommandOutput {
  readonly $metadata: SimResponseMetadata;
  readonly Functions: readonly SimLambdaFunctionConfiguration[];
  readonly NextMarker?: string | undefined;
}

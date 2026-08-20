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
 * `FunctionVersion` is the only member simulated Lambda reads. `"ALL"` adds
 * each function's published versions to the listing, and anything else lists
 * the functions themselves.
 *
 * Real Lambda pages the listing with `Marker` and `MaxItems`, and reaches
 * another Region's functions with `MasterRegion`. Neither is simulated, so
 * all three are left out rather than accepted and ignored, matching the other
 * simulated Lambda listings.
 */
export interface SimListFunctionsCommandInput {
  readonly FunctionVersion?: string | undefined;
}

/**
 * Minimal structural sim Lambda ListFunctions output.
 */
export interface SimListFunctionsCommandOutput {
  readonly $metadata: SimResponseMetadata;
  readonly Functions: readonly SimLambdaFunctionConfiguration[];
}

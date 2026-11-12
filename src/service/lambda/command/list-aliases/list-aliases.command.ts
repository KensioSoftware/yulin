/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/ListAliasesCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionAliasConfiguration } from "../../function/version/sim-lambda-function-alias.js";

/**
 * Minimal structural sim Lambda ListAliases command.
 */
export interface SimListAliasesCommand {
  readonly input: SimListAliasesCommandInput;
}

/**
 * Minimal structural sim Lambda ListAliases input.
 *
 * A `FunctionVersion` narrows the answer to the aliases pointing at one
 * version, and `MaxItems` and `Marker` page it.
 */
export interface SimListAliasesCommandInput {
  readonly FunctionName?: string | undefined;
  readonly FunctionVersion?: string | undefined;
  readonly Marker?: string | undefined;
  readonly MaxItems?: number | undefined;
}

/**
 * Minimal structural sim Lambda ListAliases output.
 */
export interface SimListAliasesCommandOutput {
  readonly $metadata: SimResponseMetadata;
  Aliases: SimLambdaFunctionAliasConfiguration[];
  NextMarker?: string | undefined;
}

/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetAliasCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionAliasConfiguration } from "../../function/version/sim-lambda-function-alias.js";

/**
 * Minimal structural sim Lambda GetAlias command.
 */
export interface SimGetAliasCommand {
  readonly input: SimGetAliasCommandInput;
}

/**
 * Minimal structural sim Lambda GetAlias input.
 */
export interface SimGetAliasCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Name?: string | undefined;
}

/**
 * Minimal structural sim Lambda GetAlias output.
 */
export interface SimGetAliasCommandOutput extends SimLambdaFunctionAliasConfiguration {
  readonly $metadata: SimResponseMetadata;
}

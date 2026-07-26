/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/ListFunctionUrlConfigsCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionUrlConfiguration } from "../../function/url/sim-lambda-function-url.js";

/**
 * Minimal structural sim Lambda ListFunctionUrlConfigs command.
 */
export interface SimListFunctionUrlConfigsCommand {
  readonly input: SimListFunctionUrlConfigsCommandInput;
}

/**
 * Minimal structural sim Lambda ListFunctionUrlConfigs input.
 */
export interface SimListFunctionUrlConfigsCommandInput {
  readonly FunctionName?: string | undefined;
}

/**
 * Minimal structural sim Lambda ListFunctionUrlConfigs output.
 */
export interface SimListFunctionUrlConfigsCommandOutput {
  readonly $metadata: SimResponseMetadata;
  FunctionUrlConfigs: SimLambdaFunctionUrlConfiguration[];
}

/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetFunctionUrlConfigCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionUrlConfiguration } from "../../function/url/sim-lambda-function-url.js";

/**
 * Minimal structural sim Lambda GetFunctionUrlConfig command.
 */
export interface SimGetFunctionUrlConfigCommand {
  readonly input: SimGetFunctionUrlConfigCommandInput;
}

/**
 * Minimal structural sim Lambda GetFunctionUrlConfig input.
 */
export interface SimGetFunctionUrlConfigCommandInput {
  readonly FunctionName?: string | undefined;
}

/**
 * Minimal structural sim Lambda GetFunctionUrlConfig output.
 */
export interface SimGetFunctionUrlConfigCommandOutput extends SimLambdaFunctionUrlConfiguration {
  readonly $metadata: SimResponseMetadata;
}

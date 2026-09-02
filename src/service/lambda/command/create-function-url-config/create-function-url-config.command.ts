/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/CreateFunctionUrlConfigCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionUrlCors } from "../../function/url/sim-lambda-function-url-cors.js";
import type {
  SimLambdaFunctionUrlAuthType,
  SimLambdaFunctionUrlConfiguration,
  SimLambdaFunctionUrlInvokeMode,
} from "../../function/url/sim-lambda-function-url.js";

/**
 * Minimal structural sim Lambda CreateFunctionUrlConfig command.
 */
export interface SimCreateFunctionUrlConfigCommand {
  readonly input: SimCreateFunctionUrlConfigCommandInput;
}

/**
 * Minimal structural sim Lambda CreateFunctionUrlConfig input.
 */
export interface SimCreateFunctionUrlConfigCommandInput {
  readonly FunctionName?: string | undefined;
  readonly AuthType?: SimLambdaFunctionUrlAuthType | undefined;
  readonly InvokeMode?: SimLambdaFunctionUrlInvokeMode | undefined;
  readonly Cors?: SimLambdaFunctionUrlCors | undefined;
}

/**
 * Minimal structural sim Lambda CreateFunctionUrlConfig output.
 */
export interface SimCreateFunctionUrlConfigCommandOutput extends SimLambdaFunctionUrlConfiguration {
  readonly $metadata: SimResponseMetadata;
}

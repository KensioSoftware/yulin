/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateFunctionUrlConfigCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionUrlCors } from "../../function/url/sim-lambda-function-url-cors.js";
import type {
  SimLambdaFunctionUrlAuthType,
  SimLambdaFunctionUrlConfiguration,
  SimLambdaFunctionUrlInvokeMode,
} from "../../function/url/sim-lambda-function-url.js";

/**
 * Minimal structural sim Lambda UpdateFunctionUrlConfig command.
 */
export interface SimUpdateFunctionUrlConfigCommand {
  readonly input: SimUpdateFunctionUrlConfigCommandInput;
}

/**
 * Minimal structural sim Lambda UpdateFunctionUrlConfig input.
 *
 * Omitted values leave that part of the configuration as it is, as on real
 * Lambda.
 */
export interface SimUpdateFunctionUrlConfigCommandInput {
  readonly FunctionName?: string | undefined;
  readonly AuthType?: SimLambdaFunctionUrlAuthType | undefined;
  readonly InvokeMode?: SimLambdaFunctionUrlInvokeMode | undefined;
  readonly Cors?: SimLambdaFunctionUrlCors | undefined;
}

/**
 * Minimal structural sim Lambda UpdateFunctionUrlConfig output.
 */
export interface SimUpdateFunctionUrlConfigCommandOutput extends SimLambdaFunctionUrlConfiguration {
  readonly $metadata: SimResponseMetadata;
}

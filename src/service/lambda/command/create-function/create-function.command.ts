/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/CreateFunctionCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionConfiguration } from "../../function/sim-lambda-function-configuration.js";

/**
 * Minimal structural sim Lambda CreateFunction command.
 */
export interface SimCreateFunctionCommand {
  readonly input: SimCreateFunctionCommandInput;
}

/**
 * Minimal structural sim Lambda function code input.
 *
 * ZipFile bytes, an S3 object location or a container image URI, as on real
 * AWS. S3ObjectVersion is accepted but ignored, as sim S3 does not simulate
 * object versioning yet.
 */
export interface SimLambdaFunctionCode {
  ZipFile?: Uint8Array | undefined;
  S3Bucket?: string | undefined;
  S3Key?: string | undefined;
  S3ObjectVersion?: string | undefined;
  ImageUri?: string | undefined;
}

/**
 * Minimal structural sim Lambda function environment configuration.
 */
export interface SimLambdaFunctionEnvironment {
  Variables?: Record<string, string> | undefined;
}

/**
 * Minimal structural sim Lambda CreateFunction input.
 */
export interface SimCreateFunctionCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Role?: string | undefined;
  readonly Code?: SimLambdaFunctionCode | undefined;
  readonly Handler?: string | undefined;
  readonly Runtime?: string | undefined;
  readonly Description?: string | undefined;
  readonly Timeout?: number | undefined;
  readonly MemorySize?: number | undefined;
  readonly Environment?: SimLambdaFunctionEnvironment | undefined;
}

/**
 * Minimal structural sim Lambda CreateFunction output.
 */
export interface SimCreateFunctionCommandOutput extends SimLambdaFunctionConfiguration {
  readonly $metadata: SimResponseMetadata;
}

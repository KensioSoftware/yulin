/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateFunctionConfigurationCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionConfiguration } from "../../function/sim-lambda-function-configuration.js";
import type { SimLambdaFunctionEnvironment } from "../create-function/create-function.command.js";

/**
 * Minimal structural sim Lambda UpdateFunctionConfiguration command.
 */
export interface SimUpdateFunctionConfigurationCommand {
  readonly input: SimUpdateFunctionConfigurationCommandInput;
}

/**
 * Minimal structural sim Lambda UpdateFunctionConfiguration input.
 *
 * These are the settings simulated Lambda models. A member left out keeps the
 * value the function has, and `Environment` replaces the whole variable map
 * rather than merging into it, as on real AWS.
 *
 * Real Lambda also takes `Layers`, `VpcConfig`, `DeadLetterConfig`,
 * `TracingConfig`, `KMSKeyArn`, `EphemeralStorage`, `SnapStart`,
 * `LoggingConfig` and a `RevisionId` precondition. None of those are
 * simulated, so all of them are left out rather than accepted and ignored.
 */
export interface SimUpdateFunctionConfigurationCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Role?: string | undefined;
  readonly Handler?: string | undefined;
  readonly Runtime?: string | undefined;
  readonly Description?: string | undefined;
  readonly Timeout?: number | undefined;
  readonly MemorySize?: number | undefined;
  readonly Environment?: SimLambdaFunctionEnvironment | undefined;
}

/**
 * Minimal structural sim Lambda UpdateFunctionConfiguration output, which is
 * the updated function's configuration.
 */
export interface SimUpdateFunctionConfigurationCommandOutput extends SimLambdaFunctionConfiguration {
  readonly $metadata: SimResponseMetadata;
}

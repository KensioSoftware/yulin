/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/CreateAliasCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionAliasConfiguration } from "../../function/version/sim-lambda-function-alias.js";

/**
 * Minimal structural sim Lambda CreateAlias command.
 */
export interface SimCreateAliasCommand {
  readonly input: SimCreateAliasCommandInput;
}

/**
 * Minimal structural sim Lambda CreateAlias input.
 *
 * The `RoutingConfig` real Lambda takes here splits an alias's traffic across
 * two versions. That is not simulated, so it is left out rather than accepted
 * and ignored.
 */
export interface SimCreateAliasCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Name?: string | undefined;
  readonly FunctionVersion?: string | undefined;
  readonly Description?: string | undefined;
}

/**
 * Minimal structural sim Lambda CreateAlias output.
 */
export interface SimCreateAliasCommandOutput extends SimLambdaFunctionAliasConfiguration {
  readonly $metadata: SimResponseMetadata;
}

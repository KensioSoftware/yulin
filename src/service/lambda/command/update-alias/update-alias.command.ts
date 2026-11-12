/**
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/UpdateAliasCommand/
 */

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimLambdaFunctionAliasConfiguration } from "../../function/version/sim-lambda-function-alias.js";

/**
 * Minimal structural sim Lambda UpdateAlias command.
 */
export interface SimUpdateAliasCommand {
  readonly input: SimUpdateAliasCommandInput;
}

/**
 * Minimal structural sim Lambda UpdateAlias input.
 *
 * An omitted member leaves that part of the alias as it is. A `RevisionId`
 * updates only an alias still at that revision. The `RoutingConfig` real
 * Lambda takes here is left out, as weighted routing is not simulated.
 */
export interface SimUpdateAliasCommandInput {
  readonly FunctionName?: string | undefined;
  readonly Name?: string | undefined;
  readonly FunctionVersion?: string | undefined;
  readonly Description?: string | undefined;
  readonly RevisionId?: string | undefined;
}

/**
 * Minimal structural sim Lambda UpdateAlias output.
 */
export interface SimUpdateAliasCommandOutput extends SimLambdaFunctionAliasConfiguration {
  readonly $metadata: SimResponseMetadata;
}

import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimRestApiAuthorizerView } from "../../api/authorizer/sim-rest-api-authorizer.js";

/**
 * Minimal structural sim API Gateway CreateAuthorizer command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/CreateAuthorizerCommand/
 */
export interface SimCreateAuthorizerCommand {
  readonly input: SimCreateAuthorizerCommandInput;
}

export interface SimCreateAuthorizerCommandInput {
  readonly restApiId?: string | undefined;
  readonly name?: string | undefined;
  readonly type?: string | undefined;
  readonly authorizerUri?: string | undefined;
  readonly providerARNs?: readonly string[] | undefined;
  readonly identitySource?: string | undefined;
}

export interface SimCreateAuthorizerCommandOutput extends SimRestApiAuthorizerView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway GetAuthorizer command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/GetAuthorizerCommand/
 */
export interface SimGetAuthorizerCommand {
  readonly input: SimGetAuthorizerCommandInput;
}

export interface SimGetAuthorizerCommandInput {
  readonly restApiId?: string | undefined;
  readonly authorizerId?: string | undefined;
}

export interface SimGetAuthorizerCommandOutput extends SimRestApiAuthorizerView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway GetAuthorizers command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/GetAuthorizersCommand/
 */
export interface SimGetAuthorizersCommand {
  readonly input: SimGetAuthorizersCommandInput;
}

export interface SimGetAuthorizersCommandInput {
  readonly restApiId?: string | undefined;
  readonly limit?: number | undefined;
  readonly position?: string | undefined;
}

export interface SimGetAuthorizersCommandOutput {
  readonly items: SimRestApiAuthorizerView[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway DeleteAuthorizer command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/api-gateway/command/DeleteAuthorizerCommand/
 */
export interface SimDeleteAuthorizerCommand {
  readonly input: SimDeleteAuthorizerCommandInput;
}

export interface SimDeleteAuthorizerCommandInput {
  readonly restApiId?: string | undefined;
  readonly authorizerId?: string | undefined;
}

export interface SimDeleteAuthorizerCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

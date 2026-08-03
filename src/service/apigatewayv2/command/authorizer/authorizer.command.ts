import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimHttpApiAuthorizerView } from "../../api/authorizer/sim-http-api-authorizer.js";

/**
 * The JwtConfiguration of a JWT authorizer, as the commands carry it.
 */
export interface SimHttpApiJwtConfigurationInput {
  readonly Issuer?: string | undefined;
  readonly Audience?: readonly string[] | undefined;
}

/**
 * Minimal structural sim API Gateway v2 CreateAuthorizer command.
 *
 * `AuthorizerCredentialsArn` is absent here on purpose. It names a Role API
 * Gateway assumes to invoke the authorizer function, and nothing here assumes
 * one, so it is refused by name rather than accepted and ignored.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/CreateAuthorizerCommand/
 */
export interface SimCreateAuthorizerCommand {
  readonly input: SimCreateAuthorizerCommandInput;
}

export interface SimCreateAuthorizerCommandInput {
  readonly ApiId?: string | undefined;
  readonly Name?: string | undefined;
  readonly AuthorizerType?: string | undefined;
  readonly IdentitySource?: readonly string[] | undefined;
  readonly JwtConfiguration?: SimHttpApiJwtConfigurationInput | undefined;
  readonly AuthorizerUri?: string | undefined;
  readonly AuthorizerPayloadFormatVersion?: string | undefined;
  readonly EnableSimpleResponses?: boolean | undefined;
  readonly AuthorizerResultTtlInSeconds?: number | undefined;
}

export interface SimCreateAuthorizerCommandOutput extends SimHttpApiAuthorizerView {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 GetAuthorizers command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/GetAuthorizersCommand/
 */
export interface SimGetAuthorizersCommand {
  readonly input: SimGetAuthorizersCommandInput;
}

export interface SimGetAuthorizersCommandInput {
  readonly ApiId?: string | undefined;
  readonly MaxResults?: string | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimGetAuthorizersCommandOutput {
  readonly Items: readonly SimHttpApiAuthorizerView[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim API Gateway v2 DeleteAuthorizer command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/apigatewayv2/command/DeleteAuthorizerCommand/
 */
export interface SimDeleteAuthorizerCommand {
  readonly input: SimDeleteAuthorizerCommandInput;
}

export interface SimDeleteAuthorizerCommandInput {
  readonly ApiId?: string | undefined;
  readonly AuthorizerId?: string | undefined;
}

export interface SimDeleteAuthorizerCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

import { renamed, type TerraformMappingContext } from "../sim-tf-attributes.js";
import type { TerraformMappedResource } from "../sim-tf-mapping.type.js";

/**
 * A user pool client.
 *
 * The pool is required, as it is on real CloudFormation: a client belongs to
 * one pool and there is nowhere to create one without it. A plan whose pool
 * this import left out therefore leaves the client out too.
 *
 * Nothing else is required. The token lifetimes and the OAuth settings arrive
 * unknown on a client that states none, because AWS decides them, and a client
 * created without them gets the same defaults here.
 */
export function cognitoUserPoolClient(
  context: TerraformMappingContext,
): TerraformMappedResource {
  return {
    Type: "AWS::Cognito::UserPoolClient",
    Properties: renamed(context, {
      UserPoolId: "user_pool_id",
      ClientName: "name",
      GenerateSecret: "generate_secret",
      ExplicitAuthFlows: "explicit_auth_flows",
      PreventUserExistenceErrors: "prevent_user_existence_errors",
      AccessTokenValidity: "access_token_validity",
      IdTokenValidity: "id_token_validity",
      RefreshTokenValidity: "refresh_token_validity",
      AuthSessionValidity: "auth_session_validity",
      AllowedOAuthFlows: "allowed_oauth_flows",
      AllowedOAuthFlowsUserPoolClient: "allowed_oauth_flows_user_pool_client",
      AllowedOAuthScopes: "allowed_oauth_scopes",
      CallbackURLs: "callback_urls",
      LogoutURLs: "logout_urls",
      DefaultRedirectURI: "default_redirect_uri",
      SupportedIdentityProviders: "supported_identity_providers",
    }),
    requires: ["UserPoolId"],
  };
}

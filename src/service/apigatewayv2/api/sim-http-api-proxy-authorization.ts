import type { SimCreateRouteCommandInput } from "../command/route/route.command.js";
import type { SimApiGatewayV2 } from "../sim-api-gateway-v2.js";

/**
 * A JWT authorizer every route of a test's API goes through.
 */
export interface SimHttpApiProxyAuthorizer {
  readonly issuer: string;
  readonly audience: readonly string[];
  readonly identitySource: string;
}

interface SimHttpApiProxyAuthorizationInput {
  readonly apiId: string;
  /** Undefined for an API whose routes admit anyone. */
  readonly jwtAuthorizer: SimHttpApiProxyAuthorizer | undefined;
  readonly authorizationScopes: readonly string[];
}

/**
 * Create the authorizer a test's API asked for, and answer the authorization
 * every route of that API is then created with.
 *
 * An API with no authorizer answers an empty input, so its routes are created
 * exactly as they were before there was anything to authorize.
 */
export async function simHttpApiProxyAuthorization(
  simApiGatewayV2: SimApiGatewayV2,
  input: SimHttpApiProxyAuthorizationInput,
): Promise<SimCreateRouteCommandInput> {
  const { apiId, jwtAuthorizer } = input;

  if (jwtAuthorizer === undefined) {
    return {};
  }

  const authorizer = await simApiGatewayV2.createAuthorizer({
    input: {
      ApiId: apiId,
      Name: "pool-authorizer",
      AuthorizerType: "JWT",
      IdentitySource: [jwtAuthorizer.identitySource],
      JwtConfiguration: {
        Issuer: jwtAuthorizer.issuer,
        Audience: [...jwtAuthorizer.audience],
      },
    },
  });

  return {
    AuthorizationType: "JWT",
    AuthorizerId: authorizer.AuthorizerId,
    AuthorizationScopes: input.authorizationScopes,
  };
}

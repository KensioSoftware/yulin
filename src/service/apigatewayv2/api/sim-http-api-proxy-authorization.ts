import type { SimAws } from "../../aws/sim-aws.js";
import type { SimCreateRouteCommandInput } from "../command/route/route.command.js";
import type { SimApiGatewayV2 } from "../sim-api-gateway-v2.js";
import {
  simHttpApiProxyRequestAuthorizer,
  type SimHttpApiProxyRequestAuthorizer,
} from "./sim-http-api-proxy-request-authorizer.js";

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
  /** Undefined unless every route goes through a Lambda authorizer. */
  readonly requestAuthorizer: SimHttpApiProxyRequestAuthorizer | undefined;
  /** Whether every route is authorized by IAM instead. */
  readonly iamAuthorization: boolean;
  readonly authorizationScopes: readonly string[];
  /** The Role the authorizer's own function runs as. */
  readonly roleArn: string;
  readonly simAws: SimAws;
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
  const { apiId, jwtAuthorizer, requestAuthorizer } = input;

  if (requestAuthorizer !== undefined) {
    return await simHttpApiProxyRequestAuthorizer(input.simAws, {
      apiId,
      roleArn: input.roleArn,
      authorizer: requestAuthorizer,
      authorizationScopes: input.authorizationScopes,
    });
  }

  if (input.iamAuthorization) {
    // An AWS_IAM route takes no authorizer at all, so there is nothing to
    // create. The scopes are still passed on, so a test asking for one is
    // refused by CreateRoute rather than quietly getting an unchecked scope.
    return {
      AuthorizationType: "AWS_IAM",
      AuthorizationScopes: input.authorizationScopes,
    };
  }

  if (jwtAuthorizer === undefined) {
    // The scopes are passed on rather than dropped, so a test asking for one
    // without an authorizer is refused by CreateRoute rather than quietly
    // getting an open route.
    return { AuthorizationScopes: input.authorizationScopes };
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

import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import {
  samAuthorizerLogicalId,
  samAuthorizerResultTtl,
} from "./sim-cfn-sam-api-auth.js";
import type { SamApiAuthorizer } from "./sim-cfn-sam-api-auth.types.js";
import { samApiIdentity } from "./sim-cfn-sam-api-identity.js";
import type { SamAuthorizerDefinition } from "./sim-cfn-sam-authorizer-definition.js";
import { samRestIdentityPrefixes } from "./sim-cfn-sam-identity-prefixes.js";

/**
 * The header a Cognito authorizer reads its token from where the template says
 * nothing, which is the one real API Gateway defaults to.
 */
const defaultIdentitySource = "method.request.header.Authorization";

/**
 * A REST API Cognito user pool authorizer, which verifies the token a request
 * carries against the pool it names.
 *
 * `AuthorizationScopes` on the authorizer is what every method it decides asks
 * of the token, and an event may ask for different ones of its own.
 */
export function samRestCognitoAuthorizer(
  authorizer: SamAuthorizerDefinition,
  userPoolArn: SimCfnTemplateValue,
): SamApiAuthorizer {
  const { api, name, definition } = authorizer;
  const identity = samApiIdentity({
    api,
    authorizerName: name,
    authorizer: definition,
    prefixes: samRestIdentityPrefixes,
  });
  const logicalId = samAuthorizerLogicalId(api, name);

  return {
    authorizationType: "COGNITO_USER_POOLS",
    logicalId,
    authorizationScopes: definition["AuthorizationScopes"],
    resources: {
      [logicalId]: {
        Type: "AWS::ApiGateway::Authorizer",
        Properties: {
          RestApiId: { Ref: api.logicalId },
          Name: name,
          Type: "COGNITO_USER_POOLS",
          ProviderARNs: [userPoolArn],
          IdentitySource:
            identity.identitySource.join(",") || defaultIdentitySource,
          ...samAuthorizerResultTtl(identity.reauthorizeEvery),
        },
      },
    },
  };
}

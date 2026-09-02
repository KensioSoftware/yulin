import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import {
  samAuthorizerLogicalId,
  samAuthorizerResultTtl,
} from "./sim-cfn-sam-api-auth.js";
import type { SamApiAuthorizer } from "./sim-cfn-sam-api-auth.types.js";
import { samApiIdentity } from "./sim-cfn-sam-api-identity.js";
import type { SamAuthorizerDefinition } from "./sim-cfn-sam-authorizer-definition.js";
import {
  samAuthorizerPermissionResource,
  samAuthorizerUri,
} from "./sim-cfn-sam-authorizer-function.js";
import { samHttpIdentityPrefixes } from "./sim-cfn-sam-identity-prefixes.js";

/**
 * An HTTP API Lambda authorizer, which asks a function of the template what to
 * do with the request.
 *
 * `AuthorizerPayloadFormatVersion` is required by SAM and goes on as it came,
 * so a version the simulation does not run is refused by CreateAuthorizer
 * naming it rather than here. An authorizer stating none gets `2.0`, the
 * format the rest of this expansion integrates a function under.
 */
export function samHttpLambdaAuthorizer(
  authorizer: SamAuthorizerDefinition,
  functionArn: SimCfnTemplateValue,
): SamApiAuthorizer {
  const { api, name, definition } = authorizer;
  const identity = samApiIdentity({
    api,
    authorizerName: name,
    authorizer: definition,
    prefixes: samHttpIdentityPrefixes,
  });
  const logicalId = samAuthorizerLogicalId(api, name);
  const simpleResponses = definition["EnableSimpleResponses"];

  return {
    authorizationType: "CUSTOM",
    logicalId,
    authorizationScopes: undefined,
    resources: {
      [logicalId]: {
        Type: "AWS::ApiGatewayV2::Authorizer",
        Properties: {
          ApiId: { Ref: api.logicalId },
          Name: name,
          AuthorizerType: "REQUEST",
          AuthorizerUri: samAuthorizerUri(functionArn),
          IdentitySource: [...identity.identitySource],
          AuthorizerPayloadFormatVersion:
            definition["AuthorizerPayloadFormatVersion"] ?? "2.0",
          ...(simpleResponses !== undefined && {
            EnableSimpleResponses: simpleResponses,
          }),
          ...samAuthorizerResultTtl(identity.reauthorizeEvery),
        },
      } satisfies SimCfnTemplateValueRecord,
      [`${logicalId}Permission`]: samAuthorizerPermissionResource({
        functionArn,
        apiLogicalId: api.logicalId,
      }),
    },
  };
}

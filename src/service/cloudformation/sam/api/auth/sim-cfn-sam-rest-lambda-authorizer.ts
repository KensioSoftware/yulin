import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import {
  samAuthError,
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
import { samRestIdentityPrefixes } from "./sim-cfn-sam-identity-prefixes.js";

/**
 * A REST API Lambda authorizer, which asks a function of the template what to
 * do with the request.
 *
 * `FunctionPayloadType` decides which of the two kinds it is. A `TOKEN`
 * authorizer is handed one header, and a `REQUEST` authorizer the whole
 * request. SAM defaults to `TOKEN`, and so does this. A `TOKEN` authorizer
 * naming no header of its own reads `Authorization`, and a `REQUEST` one is
 * allowed to read nothing by name, which is how it is asked to run on every
 * request.
 */
export function samRestLambdaAuthorizer(
  authorizer: SamAuthorizerDefinition,
  functionArn: SimCfnTemplateValue,
): SamApiAuthorizer {
  const { api, name, definition } = authorizer;
  const identity = samApiIdentity({
    api,
    authorizerName: name,
    authorizer: definition,
    prefixes: samRestIdentityPrefixes,
  });
  const logicalId = samAuthorizerLogicalId(api, name);
  const type = payloadType(authorizer);
  const declared = identity.identitySource.join(",");

  return {
    authorizationType: "CUSTOM",
    logicalId,
    authorizationScopes: undefined,
    resources: {
      [logicalId]: {
        Type: "AWS::ApiGateway::Authorizer",
        Properties: {
          RestApiId: { Ref: api.logicalId },
          Name: name,
          Type: type,
          AuthorizerUri: samAuthorizerUri(functionArn),
          ...identitySource(type, declared),
          ...samAuthorizerResultTtl(identity.reauthorizeEvery),
        },
      },
      [`${logicalId}Permission`]: samAuthorizerPermissionResource({
        functionArn,
        apiLogicalId: api.logicalId,
      }),
    },
  };
}

/**
 * Which kind of Lambda authorizer the definition asks for.
 */
function payloadType(authorizer: SamAuthorizerDefinition): string {
  const declared = authorizer.definition["FunctionPayloadType"] ?? "TOKEN";

  if (declared !== "TOKEN" && declared !== "REQUEST") {
    throw samAuthError(
      authorizer.api,
      `Auth.Authorizers.${authorizer.name}.FunctionPayloadType`,
      "it is neither TOKEN nor REQUEST",
    );
  }

  return declared;
}

/**
 * The `IdentitySource` the authorizer is created with, which a REST API states
 * as one comma-separated string.
 */
function identitySource(
  type: string,
  declared: string,
): Record<string, string> {
  const source =
    declared || (type === "TOKEN" ? "method.request.header.Authorization" : "");

  return source === "" ? {} : { IdentitySource: source };
}

import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../../sim-cfn-sam-record.js";
import {
  samAuthError,
  samAuthorizerLogicalId,
} from "./sim-cfn-sam-api-auth.js";
import type { SamApiAuthorizer } from "./sim-cfn-sam-api-auth.types.js";
import type { SamAuthorizerDefinition } from "./sim-cfn-sam-authorizer-definition.js";

/**
 * An HTTP API JWT authorizer, which verifies the token a request carries
 * against the issuer it names.
 *
 * SAM writes the issuer and audience the way the OpenAPI document does, in
 * lower case, where the Resource takes them capitalised. Both spellings are
 * read, since a template written against the CloudFormation shape is the one
 * more likely to be pasted in from elsewhere.
 */
export function samHttpJwtAuthorizer(
  authorizer: SamAuthorizerDefinition,
  jwtConfiguration: SimCfnTemplateValue,
): SamApiAuthorizer {
  const { api, name, definition } = authorizer;

  if (!isSamTemplateRecord(jwtConfiguration)) {
    throw samAuthError(
      api,
      `Auth.Authorizers.${name}.JwtConfiguration`,
      "it is not a block naming an issuer and an audience",
    );
  }

  const logicalId = samAuthorizerLogicalId(api, name);

  return {
    authorizationType: "JWT",
    logicalId,
    authorizationScopes: definition["AuthorizationScopes"],
    resources: {
      [logicalId]: {
        Type: "AWS::ApiGatewayV2::Authorizer",
        Properties: {
          ApiId: { Ref: api.logicalId },
          Name: name,
          AuthorizerType: "JWT",
          IdentitySource: identitySource(definition),
          JwtConfiguration: jwtProperties(jwtConfiguration),
        },
      },
    },
  };
}

/**
 * The issuer and audience the authorizer Resource is created with.
 *
 * A key naming nothing is left out rather than written as nothing, so what the
 * Resource is refused for is the key the template left out.
 */
function jwtProperties(
  jwtConfiguration: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const issuer = jwtConfiguration["Issuer"] ?? jwtConfiguration["issuer"];
  const audience = jwtConfiguration["Audience"] ?? jwtConfiguration["audience"];

  return {
    ...(issuer !== undefined && { Issuer: issuer }),
    ...(audience !== undefined && { Audience: audience }),
  };
}

/**
 * Where the authorizer reads the token from, which an HTTP API states as a
 * list even where SAM states one string.
 */
function identitySource(
  definition: SimCfnTemplateValueRecord,
): SimCfnTemplateValue {
  const declared = definition["IdentitySource"];

  if (declared === undefined) {
    return ["$request.header.Authorization"];
  }

  return Array.isArray(declared) ? declared : [declared];
}

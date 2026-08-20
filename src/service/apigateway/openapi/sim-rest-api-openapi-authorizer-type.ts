import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimRestApiAuthorizerType } from "../api/authorizer/sim-rest-api-authorizer.js";
import type { SimRestApiOpenApiObject } from "./sim-rest-api-openapi-object.js";

/**
 * The authorizer each `x-amazon-apigateway-authtype` is declared with: the
 * `type` its `x-amazon-apigateway-authorizer` carries, and the
 * `CreateAuthorizer` type that becomes.
 */
const authorizerTypes = new Map<string, Map<string, SimRestApiAuthorizerType>>([
  [
    "custom",
    new Map([
      ["token", "TOKEN"],
      ["request", "REQUEST"],
    ]),
  ],
  [
    "cognito_user_pools",
    new Map([["cognito_user_pools", "COGNITO_USER_POOLS"]]),
  ],
]);

/**
 * Whether an authtype declares an authorizer of its own.
 */
export function simRestApiOpenApiDeclaresAuthorizer(authType: string): boolean {
  return authorizerTypes.has(authType);
}

/**
 * The kind of authorizer a security scheme carries, refusing one the scheme's
 * own authtype does not declare.
 */
export function simRestApiOpenApiAuthorizerType(
  authorizer: SimRestApiOpenApiObject,
  authType: string,
): SimRestApiAuthorizerType {
  const types = authorizerTypes.get(authType);
  assertDefined(types, `the authorizer types of ${authType}`);
  const declared = authorizer.member("type");
  const written = declared.requiredString();
  const type = types.get(written);

  if (type === undefined) {
    throw declared.refusal(
      `is '${written}', and the security scheme carrying it declares ` +
        `x-amazon-apigateway-authtype '${authType}', which is written with ` +
        `an authorizer of type ${types.keys().toArray().join(" or ")}`,
    );
  }

  return type;
}

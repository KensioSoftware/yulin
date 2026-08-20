import { simRestApiHeaderIdentityPrefix } from "../api/authorizer/identity/sim-rest-api-header-identity-source.js";
import type { SimRestApiOpenApiObject } from "./sim-rest-api-openapi-object.js";

/**
 * The header an `apiKey` security scheme names, which is where AWS reads the
 * identity source of a `TOKEN` or `COGNITO_USER_POOLS` authorizer from.
 *
 * Both kinds read one header and nothing else, and the scheme's own `name` and
 * `in` are what say which. An `x-amazon-apigateway-authorizer` of either kind
 * carries no `identitySource` of its own, so a scheme that writes one is
 * refused where it wrote it rather than importing as a header it did not name.
 */
export function simRestApiOpenApiSchemeIdentitySource(
  scheme: SimRestApiOpenApiObject,
): string {
  const where = scheme.member("in");
  const declared = where.requiredString();

  if (declared !== "header") {
    throw where.refusal(
      `is '${declared}', and the authorizer this scheme declares reads one ` +
        `request header, so the scheme names that header with 'in: header'`,
    );
  }

  return `${simRestApiHeaderIdentityPrefix}${scheme.member("name").requiredString()}`;
}

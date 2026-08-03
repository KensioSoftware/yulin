import type { SimCreateAuthorizerCommandInput } from "../command/authorizer/authorizer.command.js";
import { SimHttpApiOpenApiJwtAuthorizerScheme } from "./sim-http-api-openapi-jwt-authorizer-scheme.js";
import type { SimHttpApiOpenApiObject } from "./sim-http-api-openapi-object.js";
import { SimHttpApiOpenApiRequestAuthorizerScheme } from "./sim-http-api-openapi-request-authorizer-scheme.js";

/**
 * The security scheme types that are not a JWT authorizer.
 *
 * `openIdConnect` is refused rather than read. AWS finds the issuer by
 * fetching the discovery document at `openIdConnectUrl`, and nothing here
 * fetches anything over HTTP, so the URL itself would end up as the issuer and
 * every token would fail its `iss` check with a silent 401.
 */
const openIdConnect =
  "AWS reads the issuer out of the discovery document published at " +
  "openIdConnectUrl, and nothing here is fetched over HTTP. Declare the " +
  "scheme as oauth2 with an explicit jwtConfiguration.issuer instead.";

/**
 * The `x-amazon-apigateway-authorizer` type each security scheme type carries,
 * which is what AWS documents for an HTTP API: a JWT authorizer under `oauth2`,
 * and a Lambda `REQUEST` authorizer under `apiKey`.
 */
const authorizerTypes = new Map([
  ["oauth2", "jwt"],
  ["apiKey", "request"],
]);

/**
 * One `components.securitySchemes` member, read into the CreateAuthorizer
 * input the operations naming it ask for.
 *
 * Which of the two kinds of authorizer a scheme carries is decided here, and
 * reading each kind is the class named after it. A scheme whose type and
 * whose extension disagree is refused rather than resolved either way.
 */
export class SimHttpApiOpenApiSecurityScheme {
  private readonly scheme: SimHttpApiOpenApiObject;

  constructor(scheme: SimHttpApiOpenApiObject) {
    this.scheme = scheme;
  }

  /**
   * The CreateAuthorizer input this scheme asks for.
   */
  createAuthorizerInput(
    apiId: string,
    name: string,
  ): SimCreateAuthorizerCommandInput {
    const authorizerType = this.authorizerType();
    const authorizer = this.authorizer(authorizerType);

    if (authorizerType === "request") {
      return new SimHttpApiOpenApiRequestAuthorizerScheme(
        authorizer,
      ).createAuthorizerInput(apiId, name);
    }

    return new SimHttpApiOpenApiJwtAuthorizerScheme(
      authorizer,
    ).createAuthorizerInput(apiId, name);
  }

  /**
   * The kind of authorizer this scheme's own type declares, refusing every
   * scheme type an HTTP API route cannot use.
   */
  private authorizerType(): string {
    const declared = this.scheme.member("type");
    const schemeType = declared.requiredString();

    if (schemeType === "openIdConnect") {
      throw declared.refusal(openIdConnect);
    }

    const authorizerType = authorizerTypes.get(schemeType);

    if (authorizerType === undefined) {
      throw declared.refusal(
        `is '${schemeType}', and an HTTP API declares a JWT authorizer under ` +
          `oauth2 and a Lambda REQUEST authorizer under apiKey`,
      );
    }

    return authorizerType;
  }

  /**
   * The `x-amazon-apigateway-authorizer` this scheme carries, refusing one of a
   * kind the scheme's own type does not declare.
   */
  private authorizer(authorizerType: string): SimHttpApiOpenApiObject {
    const authorizer = this.scheme
      .member("x-amazon-apigateway-authorizer")
      .object();
    const declared = authorizer.member("type");
    const declaredType = declared.requiredString();

    if (declaredType !== authorizerType) {
      throw declared.refusal(
        `is '${declaredType}', and the security scheme carrying it declares a ` +
          `'${authorizerType}' authorizer. A JWT authorizer and a Lambda ` +
          `REQUEST authorizer are the two an HTTP API has.`,
      );
    }

    return authorizer;
  }
}

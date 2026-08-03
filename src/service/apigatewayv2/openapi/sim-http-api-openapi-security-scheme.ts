import type { SimCreateAuthorizerCommandInput } from "../command/authorizer/authorizer.command.js";
import type { SimHttpApiOpenApiObject } from "./sim-http-api-openapi-object.js";

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
 * One `components.securitySchemes` member, read into the CreateAuthorizer
 * input the operations naming it ask for.
 *
 * The issuer and the audiences are handed to CreateAuthorizer as the document
 * wrote them, so what an authorizer requires is stated where every other
 * caller reads it. Only the translation is here: a document writes the
 * identity sources as one comma-separated string, and the command takes a list.
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
    const authorizer = this.jwtAuthorizer();
    const configuration = authorizer.member("jwtConfiguration").object();

    return {
      ApiId: apiId,
      Name: name,
      AuthorizerType: "JWT",
      IdentitySource: this.identitySource(authorizer),
      JwtConfiguration: {
        Issuer: configuration.member("issuer").optionalString(),
        Audience: configuration.member("audience").optionalStringList(),
      },
    };
  }

  /**
   * The `x-amazon-apigateway-authorizer` this scheme carries, refusing every
   * other kind of scheme and every other kind of authorizer.
   */
  private jwtAuthorizer(): SimHttpApiOpenApiObject {
    const declared = this.scheme.member("type");
    const type = declared.requiredString();

    if (type === "openIdConnect") {
      throw declared.refusal(openIdConnect);
    }

    if (type !== "oauth2") {
      throw declared.refusal(
        `is '${type}', and only an oauth2 scheme carrying a JWT ` +
          `x-amazon-apigateway-authorizer is simulated`,
      );
    }

    const authorizer = this.scheme
      .member("x-amazon-apigateway-authorizer")
      .object();

    if (authorizer.member("type").requiredString() !== "jwt") {
      throw authorizer
        .member("type")
        .refusal(
          "is not jwt, and a JWT authorizer is the only kind an imported " +
            "document creates. Create a Lambda REQUEST authorizer with " +
            "CreateAuthorizer instead",
        );
    }

    return authorizer;
  }

  /**
   * The one header or query string parameter the token is read from.
   */
  private identitySource(authorizer: SimHttpApiOpenApiObject): string[] {
    const declared = authorizer.member("identitySource");
    const sources = declared
      .requiredString()
      .split(",")
      .map((source) => source.trim())
      .filter((source) => source.length > 0);

    if (sources.length > 1) {
      throw declared.refusal(
        `carries ${String(sources.length)} identity sources, and only the ` +
          `first would be read here`,
      );
    }

    return sources;
  }
}

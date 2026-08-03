import type { SimCreateAuthorizerCommandInput } from "../command/authorizer/authorizer.command.js";
import { SimHttpApiOpenApiIdentitySource } from "./sim-http-api-openapi-identity-source.js";
import type { SimHttpApiOpenApiObject } from "./sim-http-api-openapi-object.js";

/**
 * An `x-amazon-apigateway-authorizer` of `type: jwt`, read into the
 * CreateAuthorizer input it asks for.
 *
 * The issuer and the audiences are handed to CreateAuthorizer as the document
 * wrote them, so what an authorizer requires is stated where every other caller
 * reads it.
 */
export class SimHttpApiOpenApiJwtAuthorizerScheme {
  private readonly authorizer: SimHttpApiOpenApiObject;

  constructor(authorizer: SimHttpApiOpenApiObject) {
    this.authorizer = authorizer;
  }

  /**
   * The CreateAuthorizer input this authorizer asks for.
   */
  createAuthorizerInput(
    apiId: string,
    name: string,
  ): SimCreateAuthorizerCommandInput {
    const configuration = this.authorizer.member("jwtConfiguration").object();

    return {
      ApiId: apiId,
      Name: name,
      AuthorizerType: "JWT",
      IdentitySource: new SimHttpApiOpenApiIdentitySource(
        this.authorizer,
      ).one(),
      JwtConfiguration: {
        Issuer: configuration.member("issuer").optionalString(),
        Audience: configuration.member("audience").optionalStringList(),
      },
    };
  }
}

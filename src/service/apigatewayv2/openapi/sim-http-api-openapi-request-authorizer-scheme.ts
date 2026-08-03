import type { SimCreateAuthorizerCommandInput } from "../command/authorizer/authorizer.command.js";
import { SimHttpApiOpenApiIdentitySource } from "./sim-http-api-openapi-identity-source.js";
import type { SimHttpApiOpenApiObject } from "./sim-http-api-openapi-object.js";

const authorizerCredentials =
  "names an IAM Role for API Gateway to assume before invoking the authorizer " +
  "function, and nothing here assumes one: the function's own resource policy " +
  "is what admits the call";

/**
 * The members that belong to a REST API's authorizers rather than an HTTP
 * API's, refused rather than ignored so a document written for a REST API does
 * not import as something quieter than it says.
 */
const restOnlyMembers = ["identityValidationExpression", "providerARNs"];

const restOnly =
  "configures a REST API authorizer, and an HTTP API applies none of it";

/**
 * An `x-amazon-apigateway-authorizer` of `type: request`, read into the
 * CreateAuthorizer input it asks for.
 *
 * The values are handed to CreateAuthorizer as the document wrote them, so what
 * a Lambda `REQUEST` authorizer requires is stated where an SDK caller and a
 * template already meet it. That covers the function URI, and an
 * `authorizerPayloadFormatVersion` of `1.0`, which builds a different event and
 * is refused across this simulation.
 */
export class SimHttpApiOpenApiRequestAuthorizerScheme {
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
    this.authorizer.refuseMember(
      "authorizerCredentials",
      authorizerCredentials,
    );
    this.authorizer.refuseMembers(restOnlyMembers, restOnly);

    return {
      ApiId: apiId,
      Name: name,
      AuthorizerType: "REQUEST",
      IdentitySource: new SimHttpApiOpenApiIdentitySource(
        this.authorizer,
      ).all(),
      AuthorizerUri: this.authorizer.member("authorizerUri").optionalString(),
      AuthorizerPayloadFormatVersion: this.authorizer
        .member("authorizerPayloadFormatVersion")
        .optionalString(),
      EnableSimpleResponses: this.authorizer
        .member("enableSimpleResponses")
        .optionalBoolean(),
      AuthorizerResultTtlInSeconds: this.authorizer
        .member("authorizerResultTtlInSeconds")
        .optionalNumber(),
    };
  }
}

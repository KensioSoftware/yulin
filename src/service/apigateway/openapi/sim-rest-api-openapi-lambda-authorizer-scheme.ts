import type { SimCreateAuthorizerCommandInput } from "../command/authorizer/authorizer.command.js";
import type { SimRestApiOpenApiObject } from "./sim-rest-api-openapi-object.js";
import { simRestApiOpenApiSchemeIdentitySource } from "./sim-rest-api-openapi-scheme-identity-source.js";

const authorizerCredentials =
  "names an IAM Role for API Gateway to assume before invoking the " +
  "authorizer function, and nothing here assumes one: the function's own " +
  "resource policy is what admits the call";

const identityValidationExpression =
  "checks the token against a regular expression before the function is " +
  "invoked, and that check is not simulated, so the function would be " +
  "invoked for a token AWS refuses without it";

const providerArns =
  "names the user pools a cognito_user_pools authorizer verifies tokens " +
  "against, and this one decides by invoking its function";

const tokenIdentitySource =
  "is read from the scheme's own name and in for a token authorizer, so an " +
  "identitySource here would be applied by neither AWS nor this simulation. " +
  "Declare the authorizer as type request to name the request parameters it " +
  "identifies a caller by.";

interface SimRestApiOpenApiLambdaAuthorizerSchemeProperties {
  readonly scheme: SimRestApiOpenApiObject;
  readonly authorizer: SimRestApiOpenApiObject;
  /** Which of the two kinds of Lambda authorizer the scheme declares. */
  readonly type: "TOKEN" | "REQUEST";
}

/**
 * An `x-amazon-apigateway-authorizer` of `type: token` or `type: request`,
 * read into the CreateAuthorizer input it asks for.
 *
 * The values are handed to CreateAuthorizer as the document wrote them, so
 * what a Lambda authorizer requires is stated where an SDK caller and a
 * template already meet it. That covers the wrapped function URI, the identity
 * source expressions a `REQUEST` authorizer identifies a caller by, and how
 * long its decisions are held for.
 */
export class SimRestApiOpenApiLambdaAuthorizerScheme {
  private readonly scheme: SimRestApiOpenApiObject;
  private readonly authorizer: SimRestApiOpenApiObject;
  private readonly type: "TOKEN" | "REQUEST";

  constructor(properties: SimRestApiOpenApiLambdaAuthorizerSchemeProperties) {
    this.scheme = properties.scheme;
    this.authorizer = properties.authorizer;
    this.type = properties.type;
  }

  /**
   * The CreateAuthorizer input this authorizer asks for.
   */
  createAuthorizerInput(
    restApiId: string,
    name: string,
  ): SimCreateAuthorizerCommandInput {
    this.authorizer.refuseMember(
      "authorizerCredentials",
      authorizerCredentials,
    );
    this.authorizer.refuseMember(
      "identityValidationExpression",
      identityValidationExpression,
    );
    this.authorizer.refuseMember("providerARNs", providerArns);

    return {
      restApiId,
      name,
      type: this.type,
      authorizerUri: this.authorizer.member("authorizerUri").optionalString(),
      identitySource: this.identitySource(),
      authorizerResultTtlInSeconds: this.authorizer
        .member("authorizerResultTtlInSeconds")
        .optionalNumber(),
    };
  }

  /**
   * Where this authorizer looks for what identifies a caller.
   *
   * A `TOKEN` authorizer reads the header the scheme names. A `REQUEST` one
   * names its own request parameters, which is the whole of what it has over
   * the other kind.
   */
  private identitySource(): string | undefined {
    if (this.type === "REQUEST") {
      return this.authorizer.member("identitySource").optionalString();
    }

    this.authorizer.refuseMember("identitySource", tokenIdentitySource);

    return simRestApiOpenApiSchemeIdentitySource(this.scheme);
  }
}

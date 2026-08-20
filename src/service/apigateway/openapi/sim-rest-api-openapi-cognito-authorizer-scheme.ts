import type { SimCreateAuthorizerCommandInput } from "../command/authorizer/authorizer.command.js";
import type { SimRestApiOpenApiObject } from "./sim-rest-api-openapi-object.js";
import { simRestApiOpenApiSchemeIdentitySource } from "./sim-rest-api-openapi-scheme-identity-source.js";

/**
 * The members that belong to a Lambda authorizer, refused rather than ignored
 * so a scheme declaring one under a `cognito_user_pools` authorizer does not
 * import as something quieter than it says.
 */
const lambdaMembers = [
  "authorizerUri",
  "authorizerCredentials",
  "identityValidationExpression",
];

const lambdaMember =
  "configures the function a Lambda authorizer invokes, and a " +
  "cognito_user_pools authorizer invokes nothing: it verifies the token " +
  "against the user pools it names";

const cognitoIdentitySource =
  "is read from the scheme's own name and in for a cognito_user_pools " +
  "authorizer, so an identitySource here would be applied by neither AWS nor " +
  "this simulation";

interface SimRestApiOpenApiCognitoAuthorizerSchemeProperties {
  readonly scheme: SimRestApiOpenApiObject;
  readonly authorizer: SimRestApiOpenApiObject;
}

/**
 * An `x-amazon-apigateway-authorizer` of `type: cognito_user_pools`, read into
 * the CreateAuthorizer input it asks for.
 *
 * The pool ARNs are handed to CreateAuthorizer as the document wrote them, so
 * what an authorizer verifying a user pool token requires is stated where
 * every other caller meets it. `authorizerResultTtlInSeconds` goes with them,
 * and that command refuses a period on an authorizer verifying each token as
 * it arrives.
 */
export class SimRestApiOpenApiCognitoAuthorizerScheme {
  private readonly scheme: SimRestApiOpenApiObject;
  private readonly authorizer: SimRestApiOpenApiObject;

  constructor(properties: SimRestApiOpenApiCognitoAuthorizerSchemeProperties) {
    this.scheme = properties.scheme;
    this.authorizer = properties.authorizer;
  }

  /**
   * The CreateAuthorizer input this authorizer asks for.
   */
  createAuthorizerInput(
    restApiId: string,
    name: string,
  ): SimCreateAuthorizerCommandInput {
    this.authorizer.refuseMembers(lambdaMembers, lambdaMember);
    this.authorizer.refuseMember("identitySource", cognitoIdentitySource);

    return {
      restApiId,
      name,
      type: "COGNITO_USER_POOLS",
      providerARNs: this.authorizer.member("providerARNs").optionalStringList(),
      identitySource: simRestApiOpenApiSchemeIdentitySource(this.scheme),
      authorizerResultTtlInSeconds: this.authorizer
        .member("authorizerResultTtlInSeconds")
        .optionalNumber(),
    };
  }
}

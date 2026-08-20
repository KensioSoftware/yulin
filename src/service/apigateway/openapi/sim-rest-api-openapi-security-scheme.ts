import type { SimCreateAuthorizerCommandInput } from "../command/authorizer/authorizer.command.js";
import {
  simRestApiOpenApiAuthorizerType,
  simRestApiOpenApiDeclaresAuthorizer,
} from "./sim-rest-api-openapi-authorizer-type.js";
import { SimRestApiOpenApiCognitoAuthorizerScheme } from "./sim-rest-api-openapi-cognito-authorizer-scheme.js";
import { SimRestApiOpenApiLambdaAuthorizerScheme } from "./sim-rest-api-openapi-lambda-authorizer-scheme.js";
import type { SimRestApiOpenApiObject } from "./sim-rest-api-openapi-object.js";

/**
 * The security scheme type a REST API declares every authorizer under.
 *
 * `custom`, `cognito_user_pools` and `awsSigv4` are all written as an `apiKey`
 * scheme naming the header the caller presents, and told apart by
 * `x-amazon-apigateway-authtype`.
 */
const apiKeySchemeType = "apiKey";

/**
 * The `x-amazon-apigateway-authtype` of a method decided by IAM, which
 * declares no authorizer of its own.
 */
const iamAuthType = "awsSigv4";

const schemeTypeRefusal =
  `is not '${apiKeySchemeType}', and a REST API declares every authorizer it ` +
  `has as an apiKey scheme naming the header the caller presents. An http, ` +
  `oauth2 or openIdConnect scheme names nothing a REST API method is gated by.`;

const apiKeyRefusal =
  "is required: an apiKey scheme carrying no x-amazon-apigateway-authtype " +
  "declares an API key, and API keys and usage plans are not simulated";

const authTypeRefusal =
  `and a REST API method is decided by a 'custom' Lambda authorizer, a ` +
  `'cognito_user_pools' one, or '${iamAuthType}' IAM authorization`;

const iamAuthorizerRefusal =
  `declares an authorizer to invoke or verify a token with, and the scheme ` +
  `carrying it declares x-amazon-apigateway-authtype '${iamAuthType}', which ` +
  `is decided by IAM and asks nothing else`;

/**
 * One `components.securitySchemes` member, read into what the methods naming
 * it are gated by.
 *
 * Which of the three kinds of authorization a scheme declares is decided here,
 * by `x-amazon-apigateway-authtype`, and reading each kind of authorizer is
 * the class named after it. A scheme whose authtype and whose authorizer type
 * disagree is refused rather than resolved either way.
 */
export class SimRestApiOpenApiSecurityScheme {
  private readonly scheme: SimRestApiOpenApiObject;

  constructor(scheme: SimRestApiOpenApiObject) {
    this.scheme = scheme;
  }

  /**
   * The CreateAuthorizer input this scheme asks for, or nothing at all when it
   * declares a method decided by IAM.
   */
  createAuthorizerInput(
    restApiId: string,
    name: string,
  ): SimCreateAuthorizerCommandInput | undefined {
    const authType = this.authType();

    if (authType === iamAuthType) {
      this.scheme.refuseMember(
        "x-amazon-apigateway-authorizer",
        iamAuthorizerRefusal,
      );

      return undefined;
    }

    const authorizer = this.scheme
      .member("x-amazon-apigateway-authorizer")
      .object();
    const type = simRestApiOpenApiAuthorizerType(authorizer, authType);

    if (type === "COGNITO_USER_POOLS") {
      return new SimRestApiOpenApiCognitoAuthorizerScheme({
        scheme: this.scheme,
        authorizer,
      }).createAuthorizerInput(restApiId, name);
    }

    return new SimRestApiOpenApiLambdaAuthorizerScheme({
      scheme: this.scheme,
      authorizer,
      type,
    }).createAuthorizerInput(restApiId, name);
  }

  /**
   * The kind of authorization this scheme declares, refusing a scheme a REST
   * API method cannot be gated by.
   */
  private authType(): string {
    const schemeType = this.scheme.member("type");

    if (schemeType.requiredString() !== apiKeySchemeType) {
      throw schemeType.refusal(schemeTypeRefusal);
    }

    const declared = this.scheme.member("x-amazon-apigateway-authtype");

    if (declared.absent()) {
      throw declared.refusal(apiKeyRefusal);
    }

    const authType = declared.requiredString();

    if (
      authType !== iamAuthType &&
      !simRestApiOpenApiDeclaresAuthorizer(authType)
    ) {
      throw declared.refusal(`is '${authType}', ${authTypeRefusal}`);
    }

    return authType;
  }
}

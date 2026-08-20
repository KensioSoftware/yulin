import { SimRestApiIdentitySourceParser } from "../../api/authorizer/identity/sim-rest-api-identity-source-parser.js";
import { SimRestApiIdentitySources } from "../../api/authorizer/identity/sim-rest-api-identity-sources.js";
import type {
  SimRestApiAuthorizer,
  SimRestApiAuthorizerId,
  SimRestApiAuthorizerType,
} from "../../api/authorizer/sim-rest-api-authorizer.js";
import { SimRestApiCognitoAuthorizer } from "../../api/authorizer/sim-rest-api-cognito-authorizer.js";
import { SimRestApiLambdaAuthorizer } from "../../api/authorizer/sim-rest-api-lambda-authorizer.js";
import { SimRestApiUserPoolProviders } from "../../api/authorizer/sim-rest-api-user-pool-providers.js";
import { SimRestApiLambdaUri } from "../../api/method/sim-rest-api-lambda-uri.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import type { SimCreateAuthorizerCommandInput } from "./authorizer.command.js";
import { simRestApiAuthorizerResultTtl } from "./sim-rest-api-authorizer-result-ttl.js";

interface SimRestApiAuthorizerInputProperties {
  readonly input: SimCreateAuthorizerCommandInput;
  /** The type the command settled, which decides how the rest is read. */
  readonly type: SimRestApiAuthorizerType;
}

/**
 * Reads the inputs an authorizer is created from.
 *
 * The identity source is required by real `CreateAuthorizer` for every type,
 * and an authorizer naming nowhere to look would read nothing on every
 * request. What decides then differs: a Lambda authorizer requires the
 * function it asks, and a `COGNITO_USER_POOLS` one requires the pools it
 * verifies against. Neither has a value worth guessing.
 */
export class SimRestApiAuthorizerInput {
  private readonly input: SimCreateAuthorizerCommandInput;
  private readonly type: SimRestApiAuthorizerType;

  constructor(properties: SimRestApiAuthorizerInputProperties) {
    this.input = properties.input;
    this.type = properties.type;
  }

  /**
   * The authorizer this input asks for.
   */
  read(authorizerId: SimRestApiAuthorizerId): SimRestApiAuthorizer {
    const name = this.input.name ?? "";
    const resultTtlSeconds = simRestApiAuthorizerResultTtl(
      this.input,
      this.type,
    );

    return this.type === "COGNITO_USER_POOLS"
      ? new SimRestApiCognitoAuthorizer({
          authorizerId,
          name,
          providers: SimRestApiUserPoolProviders.parse(this.providerArns()),
          identitySource: new SimRestApiIdentitySourceParser().header(
            this.identitySource(),
            this.type,
          ),
        })
      : new SimRestApiLambdaAuthorizer({
          authorizerId,
          name,
          type: this.type,
          lambdaUri: this.lambdaUri(),
          identitySources: this.identitySources(),
          resultTtlSeconds,
        });
  }

  /**
   * The function a Lambda authorizer invokes.
   *
   * An `authorizerUri` is written in the same wrapped form an integration URI
   * is, so it is read by the same parser and refused for the same reasons.
   */
  private lambdaUri(): SimRestApiLambdaUri {
    const uri = this.input.authorizerUri;

    if (uri === undefined || uri.length === 0) {
      throw new SimApiGatewayBadRequest(
        `CreateAuthorizer with type ${this.type} requires authorizerUri`,
      );
    }

    if (this.input.providerARNs !== undefined) {
      throw new SimApiGatewayBadRequest(
        `CreateAuthorizer providerARNs is set on a ${this.type} authorizer, ` +
          `which decides by invoking its function rather than by verifying a ` +
          `user pool token`,
      );
    }

    return SimRestApiLambdaUri.parse(uri);
  }

  /**
   * The user pools a `COGNITO_USER_POOLS` authorizer accepts tokens from.
   */
  private providerArns(): readonly string[] {
    if (this.input.authorizerUri !== undefined) {
      throw new SimApiGatewayBadRequest(
        "CreateAuthorizer authorizerUri is set on a COGNITO_USER_POOLS " +
          "authorizer, which verifies the token itself and invokes nothing",
      );
    }

    return this.input.providerARNs ?? [];
  }

  /**
   * Where a Lambda authorizer looks for what identifies a caller.
   *
   * A `TOKEN` authorizer names one header. A `REQUEST` authorizer names as
   * many headers and query string parameters as it likes, written as one
   * comma-separated string.
   */
  private identitySources(): SimRestApiIdentitySources {
    const identitySource = this.identitySource();

    return this.type === "TOKEN"
      ? SimRestApiIdentitySources.token(identitySource)
      : SimRestApiIdentitySources.request(identitySource);
  }

  /**
   * The identity source as it was written, which real `CreateAuthorizer`
   * requires for every type.
   */
  private identitySource(): string {
    const identitySource = this.input.identitySource;

    if (identitySource === undefined || identitySource.length === 0) {
      throw new SimApiGatewayBadRequest(
        `CreateAuthorizer with type ${this.type} requires identitySource, ` +
          `such as method.request.header.Authorization`,
      );
    }

    return identitySource;
  }
}

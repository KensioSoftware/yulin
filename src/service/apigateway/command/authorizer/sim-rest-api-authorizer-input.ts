import { SimRestApiIdentitySources } from "../../api/authorizer/identity/sim-rest-api-identity-sources.js";
import {
  SimRestApiAuthorizer,
  type SimRestApiAuthorizerId,
  type SimRestApiAuthorizerType,
} from "../../api/authorizer/sim-rest-api-authorizer.js";
import { SimRestApiLambdaUri } from "../../api/method/sim-rest-api-lambda-uri.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import type { SimCreateAuthorizerCommandInput } from "./authorizer.command.js";

interface SimRestApiAuthorizerInputProperties {
  readonly input: SimCreateAuthorizerCommandInput;
  /** The type the command settled, which decides how the rest is read. */
  readonly type: SimRestApiAuthorizerType;
}

/**
 * Reads the inputs a Lambda authorizer is created from.
 *
 * The function and the identity source are both required by real
 * `CreateAuthorizer` for either type, and neither has a value worth guessing.
 * An authorizer naming no function has nothing to ask, and one naming nowhere
 * to look would be invoked for every request including one carrying nothing.
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
    return new SimRestApiAuthorizer({
      authorizerId,
      name: this.input.name ?? "",
      type: this.type,
      lambdaUri: this.lambdaUri(),
      identitySources: this.identitySources(),
    });
  }

  /**
   * The function this authorizer invokes.
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

    return SimRestApiLambdaUri.parse(uri);
  }

  /**
   * Where the authorizer looks for what identifies a caller, which real
   * `CreateAuthorizer` requires for both simulated types.
   *
   * A `TOKEN` authorizer names one header. A `REQUEST` authorizer names as
   * many headers and query string parameters as it likes, written as one
   * comma-separated string.
   */
  private identitySources(): SimRestApiIdentitySources {
    const identitySource = this.input.identitySource;

    if (identitySource === undefined || identitySource.length === 0) {
      throw new SimApiGatewayBadRequest(
        `CreateAuthorizer with type ${this.type} requires identitySource, ` +
          `such as method.request.header.Authorization`,
      );
    }

    return this.type === "TOKEN"
      ? SimRestApiIdentitySources.token(identitySource)
      : SimRestApiIdentitySources.request(identitySource);
  }
}

import {
  SimRestApiAuthorizer,
  type SimRestApiAuthorizerId,
} from "../../api/authorizer/sim-rest-api-authorizer.js";
import { SimRestApiIdentitySource } from "../../api/authorizer/sim-rest-api-identity-source.js";
import { SimRestApiLambdaUri } from "../../api/method/sim-rest-api-lambda-uri.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import type { SimCreateAuthorizerCommandInput } from "./authorizer.command.js";

/**
 * Reads the inputs a `TOKEN` authorizer is created from.
 *
 * The function and the header are both required by real `CreateAuthorizer` for
 * this type, and neither has a value worth guessing. An authorizer naming no
 * function has nothing to ask, and one naming no header would send an empty
 * token to whatever it did name.
 */
export class SimRestApiAuthorizerInput {
  private readonly input: SimCreateAuthorizerCommandInput;

  constructor(input: SimCreateAuthorizerCommandInput) {
    this.input = input;
  }

  /**
   * The authorizer this input asks for.
   */
  read(authorizerId: SimRestApiAuthorizerId): SimRestApiAuthorizer {
    return new SimRestApiAuthorizer({
      authorizerId,
      name: this.input.name ?? "",
      lambdaUri: this.lambdaUri(),
      identitySource: SimRestApiIdentitySource.parse(this.identitySource()),
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
        "CreateAuthorizer with type TOKEN requires authorizerUri",
      );
    }

    return SimRestApiLambdaUri.parse(uri);
  }

  /**
   * The header carrying the token, which real `CreateAuthorizer` requires for
   * this type.
   */
  private identitySource(): string {
    const identitySource = this.input.identitySource;

    if (identitySource === undefined || identitySource.length === 0) {
      throw new SimApiGatewayBadRequest(
        "CreateAuthorizer with type TOKEN requires identitySource, such as " +
          "method.request.header.Authorization",
      );
    }

    return identitySource;
  }
}

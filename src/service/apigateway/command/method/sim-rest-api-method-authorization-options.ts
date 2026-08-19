import type { SimRestApiAuthorizationType } from "../../api/method/sim-rest-api-method.js";
import type { SimRestApiResource } from "../../api/resource/sim-rest-api-resource.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import type { SimPutMethodCommandInput } from "./method.command.js";
import { simRestApiCognitoAuthorizationType } from "./sim-rest-api-method-authorizer-input.js";

/**
 * An authorization type that decides a request without asking an authorizer.
 */
export type SimRestApiAuthorizerlessType = Exclude<
  SimRestApiAuthorizationType,
  "CUSTOM" | "COGNITO_USER_POOLS"
>;

interface SimRestApiMethodAuthorizationOptionsProperties {
  readonly input: SimPutMethodCommandInput;
  readonly resource: SimRestApiResource;
  readonly httpMethod: string;
}

/**
 * Refuses the options a method's authorization type has no use for.
 *
 * An option nothing reads would be ignored, leaving the caller that wrote it
 * reading a gate the method has not got.
 *
 * The resource and the HTTP method are carried for the messages, which name
 * the method the way a caller wrote it.
 */
export class SimRestApiMethodAuthorizationOptions {
  private readonly properties: SimRestApiMethodAuthorizationOptionsProperties;

  constructor(properties: SimRestApiMethodAuthorizationOptionsProperties) {
    this.properties = properties;
  }

  /**
   * Refuse scopes on a method that checks none.
   *
   * Scopes are read off the token, so only the type that reads a token has a
   * use for them.
   */
  refuseScopes(authorizationType: SimRestApiAuthorizationType): void {
    if (this.properties.input.authorizationScopes === undefined) {
      return;
    }

    throw this.refusal(
      "authorizationScopes",
      authorizationType,
      `scopes are only checked against the token a ` +
        `${simRestApiCognitoAuthorizationType} method verifies`,
    );
  }

  /**
   * Refuse an authorizer named by a method that has none to name.
   */
  refuseAuthorizerId(authorizationType: SimRestApiAuthorizerlessType): void {
    if (this.properties.input.authorizerId === undefined) {
      return;
    }

    throw this.refusal(
      "authorizerId",
      authorizationType,
      authorizationType === "NONE"
        ? "an open method sends its requests through nothing"
        : "an AWS_IAM method is decided by IAM rather than by a function",
    );
  }

  /**
   * A refusal naming the option, the method it is set on and its type.
   */
  private refusal(
    option: string,
    authorizationType: SimRestApiAuthorizationType,
    reason: string,
  ): SimApiGatewayBadRequest {
    const { httpMethod, resource } = this.properties;

    return new SimApiGatewayBadRequest(
      `PutMethod ${option} is set on ${httpMethod} ${resource.path} with ` +
        `authorizationType ${authorizationType}, and ${reason}`,
    );
  }
}

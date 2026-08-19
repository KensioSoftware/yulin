import type { SimRestApiAuthorizationType } from "../../api/method/sim-rest-api-method.js";
import type { SimRestApiResource } from "../../api/resource/sim-rest-api-resource.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import type { SimPutMethodCommandInput } from "./method.command.js";

/**
 * The authorization types real `PutMethod` takes but this simulation does not
 * build, and what a reader should know about each.
 */
const unsimulatedTypes = new Map([
  [
    "REQUEST",
    "a REQUEST authorizer receives the whole request, and that event is not " +
      "built here",
  ],
  [
    "COGNITO_USER_POOLS",
    "verifying a user pool token against a method is not simulated",
  ],
]);

/**
 * The authorization types `PutMethod` takes here, each of which something
 * enforces when a request reaches the method.
 */
const simulatedTypes = new Set<string>(["NONE", "CUSTOM", "AWS_IAM"]);

function isSimulatedType(
  declared: string,
): declared is SimRestApiAuthorizationType {
  return simulatedTypes.has(declared);
}

/**
 * An authorization type that decides a request without asking an authorizer.
 */
type SimRestApiAuthorizerlessType = Exclude<
  SimRestApiAuthorizationType,
  "CUSTOM"
>;

/**
 * What a method's authorization type and authorizer id come to.
 */
export interface SimRestApiMethodAuthorization {
  readonly authorizationType: SimRestApiAuthorizationType;
  readonly authorizerId?: string | undefined;
}

/**
 * Reads the authorization a `PutMethod` input asks for.
 *
 * A method is open, decided by IAM, or it names one of the API's authorizers.
 * Every other pairing is refused, because a method that looked gated to the
 * caller that declared it and answered every request here is worse than a
 * refused command.
 */
export class SimRestApiMethodAuthorizationInput {
  private readonly input: SimPutMethodCommandInput;

  constructor(input: SimPutMethodCommandInput) {
    this.input = input;
  }

  /**
   * The authorization this method is declared with, refusing a type nothing
   * enforces and an authorizer the API has not got.
   *
   * The resource is only needed for the message, which names the method the
   * way a caller wrote it.
   */
  read(
    restApi: SimRestApi,
    resource: SimRestApiResource,
    httpMethod: string,
  ): SimRestApiMethodAuthorization {
    const authorizationType = this.authorizationType();

    if (authorizationType === "CUSTOM") {
      return {
        authorizationType,
        authorizerId: this.authorizerId(restApi, resource, httpMethod),
      };
    }

    this.refuseAuthorizerId(authorizationType, resource, httpMethod);

    return { authorizationType };
  }

  /**
   * The authorization type, refusing one this simulation would leave open.
   *
   * Real `PutMethod` requires it, and defaulting an absent one to `NONE` here
   * would declare an open method for a request AWS rejects outright.
   */
  private authorizationType(): SimRestApiAuthorizationType {
    const declared = this.input.authorizationType;

    if (declared === undefined || declared.length === 0) {
      throw new SimApiGatewayBadRequest("PutMethod requires authorizationType");
    }

    if (isSimulatedType(declared)) {
      return declared;
    }

    const reason = unsimulatedTypes.get(declared);

    throw new SimApiGatewayBadRequest(
      `PutMethod authorizationType '${declared}' is not simulated` +
        `${reason === undefined ? "" : `: ${reason}`}. NONE, CUSTOM and ` +
        `AWS_IAM are supported.`,
    );
  }

  /**
   * The authorizer a `CUSTOM` method names, refusing one the API has not got.
   *
   * An id nothing answers to would leave a method that refuses every request
   * for a reason a caller reads as a signing problem.
   */
  private authorizerId(
    restApi: SimRestApi,
    resource: SimRestApiResource,
    httpMethod: string,
  ): string {
    const authorizerId = this.input.authorizerId;

    if (authorizerId === undefined || authorizerId.length === 0) {
      throw new SimApiGatewayBadRequest(
        `PutMethod with authorizationType CUSTOM requires authorizerId for ` +
          `${httpMethod} ${resource.path}`,
      );
    }

    if (restApi.authorizers.find(authorizerId) === undefined) {
      throw new SimApiGatewayBadRequest(
        `PutMethod authorizerId '${authorizerId}' for ${httpMethod} ` +
          `${resource.path} names no authorizer of REST API ${restApi.apiId}`,
      );
    }

    return authorizerId;
  }

  /**
   * Refuse an authorizer named by a method that has none to name.
   *
   * A method whose type takes no authorizer would ignore the id, leaving the
   * caller that wrote it reading a gate the method has not got.
   */
  private refuseAuthorizerId(
    authorizationType: SimRestApiAuthorizerlessType,
    resource: SimRestApiResource,
    httpMethod: string,
  ): void {
    if (this.input.authorizerId === undefined) {
      return;
    }

    const reason =
      authorizationType === "NONE"
        ? "an open method sends its requests through nothing"
        : "an AWS_IAM method is decided by IAM rather than by a function";

    throw new SimApiGatewayBadRequest(
      `PutMethod authorizerId is set on ${httpMethod} ${resource.path} with ` +
        `authorizationType ${authorizationType}, and ${reason}`,
    );
  }
}

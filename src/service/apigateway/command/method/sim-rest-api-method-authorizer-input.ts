import type { SimRestApiAuthorizer } from "../../api/authorizer/sim-rest-api-authorizer.js";
import type { SimRestApiAuthorizationType } from "../../api/method/sim-rest-api-method.js";
import type { SimRestApiResource } from "../../api/resource/sim-rest-api-resource.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";

/**
 * The authorization type of a method whose token a user pool issued.
 */
export const simRestApiCognitoAuthorizationType = "COGNITO_USER_POOLS";

interface SimRestApiMethodAuthorizerInputProperties {
  readonly restApi: SimRestApi;
  readonly resource: SimRestApiResource;
  readonly httpMethod: string;
}

/**
 * Finds the authorizer a gated method names, against the API it is declared
 * on.
 *
 * A method that names nothing, one naming an id the API has not got, and one
 * naming an authorizer that decides some other way are all refused. Each would
 * leave a method refusing every request for a reason a caller reads as a
 * signing problem.
 *
 * The resource and the HTTP method are carried for the messages, which name
 * the method the way a caller wrote it.
 */
export class SimRestApiMethodAuthorizerInput {
  private readonly restApi: SimRestApi;
  private readonly resource: SimRestApiResource;
  private readonly httpMethod: string;

  constructor(properties: SimRestApiMethodAuthorizerInputProperties) {
    this.restApi = properties.restApi;
    this.resource = properties.resource;
    this.httpMethod = properties.httpMethod;
  }

  /**
   * The id of the authorizer this method may be declared with.
   */
  read(
    authorizerId: string | undefined,
    authorizationType: SimRestApiAuthorizationType,
  ): string {
    if (authorizerId === undefined || authorizerId.length === 0) {
      throw new SimApiGatewayBadRequest(
        `PutMethod with authorizationType ${authorizationType} requires ` +
          `authorizerId for ${this.httpMethod} ${this.resource.path}`,
      );
    }

    const authorizer = this.restApi.authorizers.find(authorizerId);

    if (authorizer === undefined) {
      throw this.refusal(
        `authorizerId '${authorizerId}'`,
        `names no authorizer of REST API ${this.restApi.apiId}`,
      );
    }

    this.refuseOtherKind(authorizer, authorizationType);

    return authorizerId;
  }

  /**
   * Refuse an authorizer that decides some other way than the method's
   * authorization type says.
   *
   * A `COGNITO_USER_POOLS` method verifies a user pool token, and every other
   * gated method invokes a function, so the two never stand in for each other.
   */
  private refuseOtherKind(
    authorizer: SimRestApiAuthorizer,
    authorizationType: SimRestApiAuthorizationType,
  ): void {
    const cognitoAuthorizer =
      authorizer.type === simRestApiCognitoAuthorizationType;

    if (
      cognitoAuthorizer ===
      (authorizationType === simRestApiCognitoAuthorizationType)
    ) {
      return;
    }

    throw this.refusal(
      `authorizerId '${authorizer.authorizerId}'`,
      `names a ${authorizer.type} authorizer, which does not serve ` +
        `authorizationType ${authorizationType}`,
    );
  }

  /**
   * A refusal naming the option, then the method it is set on.
   */
  private refusal(option: string, reason: string): SimApiGatewayBadRequest {
    return new SimApiGatewayBadRequest(
      `PutMethod ${option} for ${this.httpMethod} ${this.resource.path} ${
        reason
      }`,
    );
  }
}

import type {
  SimHttpApiAuthorizerId,
  SimHttpApiAuthorizerType,
} from "../../api/authorizer/sim-http-api-authorizer.js";
import type { SimHttpApi } from "../../api/sim-http-api.js";
import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";

interface SimHttpApiRouteAuthorizerInputProperties {
  /** The route's own authorization type, which names the kind it needs. */
  readonly authorizationType: string;
  readonly authorizerId: string | undefined;
}

/**
 * Finds the authorizer a route names, of the kind that route authorizes with.
 *
 * A route deploying with an `AuthorizerId` that resolved to nothing, or to the
 * other kind of authorizer, would be open here and closed on AWS, which is the
 * failure this whole area exists to avoid, so both are refused rather than
 * created.
 */
export class SimHttpApiRouteAuthorizerInput {
  private readonly authorizationType: string;
  private readonly authorizerId: string | undefined;

  constructor(properties: SimHttpApiRouteAuthorizerInputProperties) {
    this.authorizationType = properties.authorizationType;
    this.authorizerId = properties.authorizerId;
  }

  /**
   * The id of the authorizer this route sends its requests through.
   */
  read(
    api: SimHttpApi,
    authorizerType: SimHttpApiAuthorizerType,
  ): SimHttpApiAuthorizerId {
    const authorizerId = this.authorizerId;

    if (authorizerId === undefined || authorizerId.length === 0) {
      throw new SimApiGatewayV2BadRequest(
        `CreateRoute with AuthorizationType ${this.authorizationType} ` +
          `requires AuthorizerId`,
      );
    }

    const authorizer = api.authorizers.find(authorizerId);

    if (authorizer === undefined) {
      throw new SimApiGatewayV2BadRequest(
        `CreateRoute AuthorizerId ${authorizerId} names no authorizer on ` +
          `API ${api.apiId}. The route would be open here and closed on AWS.`,
      );
    }

    if (authorizer.authorizerType !== authorizerType) {
      throw new SimApiGatewayV2BadRequest(
        `CreateRoute AuthorizerId ${authorizerId} names a ` +
          `${authorizer.authorizerType} authorizer on API ${api.apiId}, and ` +
          `an AuthorizationType of ${this.authorizationType} takes a ` +
          `${authorizerType} one`,
      );
    }

    return authorizer.authorizerId;
  }
}

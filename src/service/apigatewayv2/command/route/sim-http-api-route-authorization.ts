import type { SimHttpApiAuthorizerId } from "../../api/authorizer/sim-http-api-authorizer.js";
import type { SimHttpApiAuthorizationType } from "../../api/route/sim-http-api-route.js";
import { SimHttpApiRouteScopes } from "../../api/route/sim-http-api-route-scopes.js";
import type { SimHttpApi } from "../../api/sim-http-api.js";
import { SimApiGatewayV2BadRequest } from "../../error/sim-api-gateway-v2.error.js";
import type { SimCreateRouteCommandInput } from "./route.command.js";

/**
 * How a route says who may call it.
 */
export interface SimHttpApiRouteAuthorization {
  readonly authorizationType: SimHttpApiAuthorizationType;
  readonly authorizerId?: SimHttpApiAuthorizerId | undefined;
  readonly authorizationScopes: SimHttpApiRouteScopes;
}

/**
 * Reads the authorization a CreateRoute input asks for, against the API it is
 * being created on.
 *
 * A `JWT` route has to name an authorizer the API has. A route deploying with
 * an `AuthorizerId` that resolved to nothing would be open here and closed on
 * AWS, which is the failure this whole area exists to avoid, so it is refused
 * rather than created.
 */
export class SimHttpApiRouteAuthorizationInput {
  private readonly input: SimCreateRouteCommandInput;

  constructor(input: SimCreateRouteCommandInput) {
    this.input = input;
  }

  /**
   * The authorization this route is created with.
   */
  read(api: SimHttpApi): SimHttpApiRouteAuthorization {
    if ((this.input.AuthorizationType ?? "NONE") === "NONE") {
      return this.open();
    }

    return {
      authorizationType: "JWT",
      authorizerId: this.authorizer(api),
      authorizationScopes: new SimHttpApiRouteScopes(
        this.input.AuthorizationScopes ?? [],
      ),
    };
  }

  /**
   * A route anyone may call, which is what a route says by leaving
   * `AuthorizationType` out.
   */
  private open(): SimHttpApiRouteAuthorization {
    if (this.input.AuthorizerId !== undefined) {
      throw new SimApiGatewayV2BadRequest(
        `CreateRoute AuthorizerId is set on a route with ` +
          `AuthorizationType NONE, which would be ignored here and would ` +
          `leave the route open on AWS too`,
      );
    }

    if ((this.input.AuthorizationScopes ?? []).length > 0) {
      throw new SimApiGatewayV2BadRequest(
        `CreateRoute AuthorizationScopes is set on a route with ` +
          `AuthorizationType NONE, and nothing checks a scope on a route ` +
          `that authorizes nobody`,
      );
    }

    return {
      authorizationType: "NONE",
      authorizationScopes: new SimHttpApiRouteScopes(),
    };
  }

  private authorizer(api: SimHttpApi): SimHttpApiAuthorizerId {
    const authorizerId = this.input.AuthorizerId;

    if (authorizerId === undefined || authorizerId.length === 0) {
      throw new SimApiGatewayV2BadRequest(
        "CreateRoute with AuthorizationType JWT requires AuthorizerId",
      );
    }

    const authorizer = api.authorizers.find(authorizerId);

    if (authorizer === undefined) {
      throw new SimApiGatewayV2BadRequest(
        `CreateRoute AuthorizerId ${authorizerId} names no authorizer on ` +
          `API ${api.apiId}. The route would be open here and closed on AWS.`,
      );
    }

    return authorizer.authorizerId;
  }
}

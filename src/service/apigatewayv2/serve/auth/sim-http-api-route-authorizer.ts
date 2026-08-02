import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  SimHttpApiAdmitted,
  type SimHttpApiAuthorization,
  SimHttpApiRefused,
} from "../../api/authorizer/sim-http-api-authorization.js";
import { SimHttpApiJwtVerification } from "../../api/authorizer/sim-http-api-jwt-verification.js";
import type { SimHttpApiRoute } from "../../api/route/sim-http-api-route.js";
import type { SimHttpApi } from "../../api/sim-http-api.js";

interface SimHttpApiRouteAuthorizerProperties {
  /**
   * Clock the token's time claims are checked against, so advancing simulated
   * time expires a token that was accepted before it.
   */
  readonly clock: SimClock;
}

interface SimHttpApiRouteAuthorizeInput {
  readonly api: SimHttpApi;
  readonly route: SimHttpApiRoute;
  readonly request: Request;
}

/**
 * Decides whether one request may have the route that matched it.
 *
 * This is the client's side of the question, and it runs before the API asks
 * whether it may invoke the integration: a request presenting no token is
 * refused with a 401 whether or not the integration behind the route would
 * have worked.
 */
export class SimHttpApiRouteAuthorizer {
  private readonly clock: SimClock;

  constructor(properties: SimHttpApiRouteAuthorizerProperties) {
    this.clock = properties.clock;
  }

  /**
   * Authorize one request against the route that matched it.
   */
  authorize(input: SimHttpApiRouteAuthorizeInput): SimHttpApiAuthorization {
    const { api, route, request } = input;

    if (route.authorizationType === "NONE") {
      // Nobody was authorized, so there is no caller to describe, which is
      // what leaves requestContext.authorizer out of the event entirely.
      return new SimHttpApiAdmitted();
    }

    // A JWT route always names an authorizer, and that authorizer can still be
    // deleted out from under it, so the two come to the same thing here: with
    // no authorizer to ask, the route stays closed.
    const authorizer = api.authorizers.find(route.authorizerId ?? "");

    if (authorizer === undefined) {
      return SimHttpApiRefused.unauthorized();
    }

    const presented = authorizer.identitySource.token(request);

    if (presented === undefined) {
      return SimHttpApiRefused.unauthorized();
    }

    const authorization = new SimHttpApiJwtVerification({
      issuerKeys: api.jwtIssuerKeys,
      clock: this.clock,
    }).verify(authorizer, presented);

    if (!authorization.admitted) {
      return authorization;
    }

    // The scopes are the route's own rather than the authorizer's, so one
    // authorizer covers routes asking for different scopes. An unmet scope is
    // the one refusal that is a 403: the token was accepted, and it does not
    // allow this route.
    if (!route.authorizationScopes.permits(authorization.jwt?.scopes ?? null)) {
      return SimHttpApiRefused.forbidden();
    }

    return authorization;
  }
}

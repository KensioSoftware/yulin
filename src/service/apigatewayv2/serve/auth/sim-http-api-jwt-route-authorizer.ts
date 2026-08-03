import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  type SimHttpApiAuthorization,
  SimHttpApiRefused,
} from "../../api/authorizer/sim-http-api-authorization.js";
import { SimHttpApiJwtAuthorizer } from "../../api/authorizer/sim-http-api-jwt-authorizer.js";
import { SimHttpApiJwtVerification } from "../../api/authorizer/sim-http-api-jwt-verification.js";
import type { SimHttpApiRouteAuthorizeInput } from "./sim-http-api-route-authorize-input.js";

interface SimHttpApiJwtRouteAuthorizerProperties {
  /**
   * Clock the token's time claims are checked against, so advancing simulated
   * time expires a token that was accepted before it.
   */
  readonly clock: SimClock;
}

/**
 * Decides whether one request may have a `JWT` route.
 *
 * The token has to verify against the keys its issuer publishes, and the
 * route's scopes have to be met. Every refusal up to and including claim
 * validation is one 401; an unmet scope is the one 403.
 */
export class SimHttpApiJwtRouteAuthorizer {
  private readonly clock: SimClock;

  constructor(properties: SimHttpApiJwtRouteAuthorizerProperties) {
    this.clock = properties.clock;
  }

  /**
   * Authorize one request against the `JWT` route that matched it.
   */
  authorize(input: SimHttpApiRouteAuthorizeInput): SimHttpApiAuthorization {
    const { api, match, request } = input;
    const { route } = match;

    // A JWT route always names a JWT authorizer, and that authorizer can still
    // be deleted out from under it, so the two come to the same thing here:
    // with no authorizer to ask, the route stays closed.
    const authorizer = api.authorizers.find(route.authorizerId ?? "");

    if (!(authorizer instanceof SimHttpApiJwtAuthorizer)) {
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

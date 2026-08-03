import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  type SimHttpApiAuthorization,
  SimHttpApiRefused,
} from "../../api/authorizer/sim-http-api-authorization.js";
import { SimHttpApiRequestAuthorizer } from "../../api/authorizer/sim-http-api-request-authorizer.js";
import { SimHttpApiAuthorizerDecisions } from "./sim-http-api-authorizer-decisions.js";
import {
  type SimHttpApiAuthorizerFunctions,
  SimHttpApiAuthorizerInvocation,
} from "./sim-http-api-authorizer-invocation.js";
import type { SimHttpApiRouteAuthorizeInput } from "./sim-http-api-route-authorize-input.js";

interface SimHttpApiRequestRouteAuthorizerProperties {
  /**
   * Clock the authorizer's own invocation event is stamped with, and the one
   * a held decision expires against, so advancing simulated time drops a
   * decision that was being reused a moment before.
   */
  readonly clock: SimClock;
  readonly functions: SimHttpApiAuthorizerFunctions;
}

/**
 * Decides whether one request may have a `CUSTOM` route, by invoking the
 * Lambda function the route's authorizer names.
 *
 * The steps are the ones real API Gateway takes, in this order:
 *
 * 1. the request has to carry every identity source the authorizer was
 *    configured with, or it is refused with a 401 and the function is never
 *    invoked;
 * 2. a decision already made for those same identity source values, and not
 *    yet expired, is reused by `SimHttpApiAuthorizerDecisions`, and nothing
 *    further happens;
 * 3. otherwise `SimHttpApiAuthorizerInvocation` asks the function, and what it
 *    answered decides.
 *
 * An authorizer with no `AuthorizerResultTtlInSeconds` holds nothing, so its
 * function is invoked once per request reaching the route.
 */
export class SimHttpApiRequestRouteAuthorizer {
  private readonly decisions: SimHttpApiAuthorizerDecisions;
  private readonly invocation: SimHttpApiAuthorizerInvocation;

  constructor(properties: SimHttpApiRequestRouteAuthorizerProperties) {
    this.decisions = new SimHttpApiAuthorizerDecisions({
      clock: properties.clock,
    });
    this.invocation = new SimHttpApiAuthorizerInvocation({
      clock: properties.clock,
      functions: properties.functions,
    });
  }

  /**
   * Authorize one request against the `CUSTOM` route that matched it.
   */
  async authorize(
    input: SimHttpApiRouteAuthorizeInput,
  ): Promise<SimHttpApiAuthorization> {
    const { api, match, request } = input;
    const authorizer = api.authorizers.find(match.route.authorizerId ?? "");

    // A CUSTOM route always names a REQUEST authorizer, and that authorizer
    // can still be deleted out from under it, so the two come to the same
    // thing here: with nothing to ask, the route stays closed.
    if (!(authorizer instanceof SimHttpApiRequestAuthorizer)) {
      return SimHttpApiRefused.unauthorized();
    }

    const identitySource = authorizer.identitySources.values({
      request,
      routeKey: match.route.routeKey,
    });

    if (identitySource === undefined) {
      return SimHttpApiRefused.unauthorized();
    }

    return await this.decisions.decide(authorizer, identitySource, async () =>
      this.invocation.invoke(input, authorizer, identitySource),
    );
  }
}

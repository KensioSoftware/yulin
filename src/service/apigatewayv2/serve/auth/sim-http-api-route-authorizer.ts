import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  SimHttpApiAdmitted,
  type SimHttpApiAuthorization,
} from "../../api/authorizer/sim-http-api-authorization.js";
import { SimHttpApiIamRouteAuthorizer } from "./sim-http-api-iam-route-authorizer.js";
import { SimHttpApiJwtRouteAuthorizer } from "./sim-http-api-jwt-route-authorizer.js";
import {
  type SimHttpApiAuthorizerFunctions,
  SimHttpApiRequestRouteAuthorizer,
} from "./sim-http-api-request-route-authorizer.js";
import type { SimHttpApiRouteAuthorizeInput } from "./sim-http-api-route-authorize-input.js";

interface SimHttpApiRouteAuthorizerProperties {
  /**
   * Clock a JWT route's time claims are checked against, so advancing
   * simulated time expires a token that was accepted before it, and the one a
   * Lambda authorizer's own invocation event is stamped with.
   */
  readonly clock: SimClock;
  /**
   * Where a Lambda authorizer's function is found, which is the same router
   * that finds an integration's.
   */
  readonly functions: SimHttpApiAuthorizerFunctions;
}

/**
 * Decides whether one request may have the route that matched it.
 *
 * This is the client's side of the question, and it runs before the API asks
 * whether it may invoke the integration: a request presenting no credentials
 * is refused whether or not the integration behind the route would have
 * worked.
 *
 * Which kind of authorization the route asks for is settled here, and each
 * kind decides on its own terms.
 */
export class SimHttpApiRouteAuthorizer {
  private readonly jwtAuthorizer: SimHttpApiJwtRouteAuthorizer;
  private readonly requestAuthorizer: SimHttpApiRequestRouteAuthorizer;
  private readonly iamAuthorizer = new SimHttpApiIamRouteAuthorizer();

  constructor(properties: SimHttpApiRouteAuthorizerProperties) {
    this.jwtAuthorizer = new SimHttpApiJwtRouteAuthorizer({
      clock: properties.clock,
    });
    this.requestAuthorizer = new SimHttpApiRequestRouteAuthorizer({
      clock: properties.clock,
      functions: properties.functions,
    });
  }

  /**
   * Authorize one request against the route that matched it.
   */
  async authorize(
    input: SimHttpApiRouteAuthorizeInput,
  ): Promise<SimHttpApiAuthorization> {
    switch (input.match.route.authorizationType) {
      case "NONE": {
        // Nobody was authorized, so there is no caller to describe, which is
        // what leaves requestContext.authorizer out of the event entirely.
        return new SimHttpApiAdmitted();
      }
      case "JWT": {
        return this.jwtAuthorizer.authorize(input);
      }
      case "AWS_IAM": {
        return this.iamAuthorizer.authorize(input);
      }
      case "CUSTOM": {
        return await this.requestAuthorizer.authorize(input);
      }
    }
  }
}

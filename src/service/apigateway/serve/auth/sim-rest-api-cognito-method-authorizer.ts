import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { simJwtBearerToken } from "../../../../util/jwt/sim-jwt-bearer-token.js";
import {
  type SimRestApiAuthorization,
  SimRestApiRefused,
} from "../../api/authorizer/sim-rest-api-authorization.js";
import { SimRestApiCognitoAuthorizer } from "../../api/authorizer/sim-rest-api-cognito-authorizer.js";
import { SimRestApiCognitoVerification } from "../../api/authorizer/sim-rest-api-cognito-verification.js";
import type { SimRestApiMethodAuthorizeInput } from "./sim-rest-api-method-authorize-input.js";

interface SimRestApiCognitoMethodAuthorizerProperties {
  /**
   * Clock the token's time claims are checked against, so advancing simulated
   * time expires a token that was accepted before it.
   */
  readonly clock: SimClock;
}

/**
 * Decides whether one request may have a `COGNITO_USER_POOLS` method.
 *
 * Nothing is invoked. The token has to verify against the keys one of the
 * authorizer's pools publishes, and the scopes the method asks for have to be
 * met.
 */
export class SimRestApiCognitoMethodAuthorizer {
  private readonly clock: SimClock;

  constructor(properties: SimRestApiCognitoMethodAuthorizerProperties) {
    this.clock = properties.clock;
  }

  /**
   * Authorize one request against the `COGNITO_USER_POOLS` method that
   * matched it.
   */
  authorize(input: SimRestApiMethodAuthorizeInput): SimRestApiAuthorization {
    const { restApi, match, request } = input;
    const authorizer = restApi.authorizers.find(
      match.method.authorizerId ?? "",
    );

    // Such a method always names a Cognito authorizer, and that authorizer can
    // still be deleted out from under it, so the two come to the same thing
    // here: with nothing to verify against, the method stays closed.
    if (!(authorizer instanceof SimRestApiCognitoAuthorizer)) {
      return SimRestApiRefused.unauthorized();
    }

    const presented = simJwtBearerToken(
      authorizer.identitySource.value(request),
    );

    if (presented === undefined) {
      return SimRestApiRefused.unauthorized();
    }

    return new SimRestApiCognitoVerification({
      userPools: restApi.userPools,
      clock: this.clock,
    }).verify(authorizer, presented, match.method.authorizationScopes);
  }
}

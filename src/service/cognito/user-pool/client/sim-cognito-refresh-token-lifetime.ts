import {
  requireCognitoTokenValidityUnit,
  SimCognitoTokenLifetime,
} from "./sim-cognito-token-lifetime.js";
import {
  defaultRefreshTokenValidityDays,
  refreshTokenLifetimeSpec,
} from "./sim-cognito-token-lifetime-specs.js";

/**
 * Build an app client's refresh token lifetime.
 *
 * This is the one lifetime with a rule of its own: Cognito substitutes thirty
 * days both for an absent validity and for a zero. The substituted default is
 * thirty days whatever unit the request named, so the unit is left out along
 * with the value it would have counted. It is still checked first, because
 * real Cognito refuses a unit it does not have whether or not the unit ends
 * up counting anything.
 */
export function makeSimCognitoRefreshTokenLifetime(
  requested: number | undefined,
  unit: string | undefined,
): SimCognitoTokenLifetime {
  requireCognitoTokenValidityUnit(
    refreshTokenLifetimeSpec.field,
    unit,
    refreshTokenLifetimeSpec.defaultUnit,
  );

  if (requested === undefined || requested === 0) {
    return new SimCognitoTokenLifetime({
      ...refreshTokenLifetimeSpec,
      validity: defaultRefreshTokenValidityDays,
      unit: undefined,
    });
  }

  return new SimCognitoTokenLifetime({
    ...refreshTokenLifetimeSpec,
    validity: requested,
    unit,
  });
}

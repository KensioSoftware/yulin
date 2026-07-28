import type { SimCognitoTokenLifetimeProperties } from "./sim-cognito-token-lifetime.js";

/**
 * What Cognito allows one kind of token, apart from the validity a request
 * asks for.
 */
type SimCognitoTokenLifetimeSpec = Omit<
  SimCognitoTokenLifetimeProperties,
  "validity" | "unit"
>;

const oneHourSeconds = 60 * 60;
const oneDaySeconds = 24 * oneHourSeconds;
const fiveMinutesSeconds = 5 * 60;
const tenYearsSeconds = 315_360_000;

/**
 * The number of days a refresh token lasts when the request says nothing.
 *
 * Cognito reports this default on the client rather than leaving the field
 * out, and it overwrites a requested `0` with it.
 */
export const defaultRefreshTokenValidityDays = 30;

/**
 * Access tokens are counted in hours, last an hour by default, and may last
 * between five minutes and a day.
 */
export const accessTokenLifetimeSpec: SimCognitoTokenLifetimeSpec = {
  field: "AccessTokenValidity",
  defaultUnit: "hours",
  defaultSeconds: oneHourSeconds,
  leastSeconds: fiveMinutesSeconds,
  mostSeconds: oneDaySeconds,
};

/**
 * ID tokens follow the same rules as access tokens.
 */
export const idTokenLifetimeSpec: SimCognitoTokenLifetimeSpec = {
  ...accessTokenLifetimeSpec,
  field: "IdTokenValidity",
};

/**
 * Refresh tokens are counted in days, last thirty by default, and may last
 * between an hour and ten years.
 */
export const refreshTokenLifetimeSpec: SimCognitoTokenLifetimeSpec = {
  field: "RefreshTokenValidity",
  defaultUnit: "days",
  defaultSeconds: defaultRefreshTokenValidityDays * oneDaySeconds,
  leastSeconds: oneHourSeconds,
  mostSeconds: tenYearsSeconds,
};

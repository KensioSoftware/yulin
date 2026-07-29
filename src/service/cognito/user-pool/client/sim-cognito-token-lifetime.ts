import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

export type SimCognitoTokenValidityUnit =
  "seconds" | "minutes" | "hours" | "days";

const secondsPerUnit: Readonly<Record<SimCognitoTokenValidityUnit, number>> = {
  seconds: 1,
  minutes: 60,
  hours: 60 * 60,
  days: 24 * 60 * 60,
};

/**
 * What one token lifetime is made of: the validity a request asked for, the
 * unit it is counted in, and what Cognito allows for that kind of token.
 */
export interface SimCognitoTokenLifetimeProperties {
  /**
   * The request input the validity came from, such as `AccessTokenValidity`.
   */
  readonly field: string;
  readonly validity: number | undefined;
  readonly unit: string | undefined;
  readonly defaultUnit: SimCognitoTokenValidityUnit;
  readonly defaultSeconds: number;
  readonly leastSeconds: number;
  readonly mostSeconds: number;
}

/**
 * How long one kind of token from an app client lasts.
 *
 * A validity is a number in a unit, and the two arrive in separate request
 * inputs, so the same `1` means an hour for an access token and a day for a
 * refresh token. Resolving both into seconds in one place is what stops the
 * pairing being got wrong somewhere later.
 */
export class SimCognitoTokenLifetime {
  /**
   * The validity as the request wrote it, which is what Cognito reports back.
   */
  public readonly validity: number | undefined;

  /**
   * The unit the validity is counted in, defaulted as Cognito defaults it.
   */
  public readonly unit: SimCognitoTokenValidityUnit;

  /**
   * How long the token lasts, in seconds.
   */
  public readonly seconds: number;

  constructor(properties: SimCognitoTokenLifetimeProperties) {
    const { field, validity, defaultSeconds, leastSeconds, mostSeconds } =
      properties;

    this.unit = requireCognitoTokenValidityUnit(
      field,
      properties.unit,
      properties.defaultUnit,
    );
    this.validity = validity;

    if (validity === undefined) {
      this.seconds = defaultSeconds;
      return;
    }

    if (!Number.isSafeInteger(validity) || validity < 0) {
      throw new SimCognitoInvalidParameterException(
        `${field} must be a whole number of ${this.unit}`,
      );
    }

    const seconds = validity * secondsPerUnit[this.unit];

    if (seconds < leastSeconds || seconds > mostSeconds) {
      throw new SimCognitoInvalidParameterException(
        `${field} of ${String(validity)} ${this.unit} is outside the range ` +
          `Cognito allows: between ${String(leastSeconds)} and ` +
          `${String(mostSeconds)} seconds`,
      );
    }

    this.seconds = seconds;
  }
}

/**
 * Read a requested token validity unit, or refuse one Cognito does not have.
 *
 * This is separate from the lifetime it belongs to because a unit is refused
 * whether or not the validity counted in it is used. A request naming a unit
 * and no validity still fails on real Cognito, so it fails here.
 */
export function requireCognitoTokenValidityUnit(
  field: string,
  unit: string | undefined,
  fallback: SimCognitoTokenValidityUnit,
): SimCognitoTokenValidityUnit {
  if (unit === undefined) {
    return fallback;
  }

  if (!Object.hasOwn(secondsPerUnit, unit)) {
    throw new SimCognitoInvalidParameterException(
      `TokenValidityUnits for ${field} is '${unit}', which is not a ` +
        `Cognito token validity unit: use seconds, minutes, hours or days`,
    );
  }

  return unit as SimCognitoTokenValidityUnit;
}

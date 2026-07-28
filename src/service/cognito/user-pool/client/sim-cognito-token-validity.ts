import { SimCognitoTokenLifetime } from "./sim-cognito-token-lifetime.js";
import {
  accessTokenLifetimeSpec,
  defaultRefreshTokenValidityDays,
  idTokenLifetimeSpec,
  refreshTokenLifetimeSpec,
} from "./sim-cognito-token-lifetime-specs.js";

/**
 * The units an app client's token validities are counted in.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_TokenValidityUnitsType.html
 */
export interface SimCognitoTokenValidityUnitsType {
  readonly AccessToken?: string | undefined;
  readonly IdToken?: string | undefined;
  readonly RefreshToken?: string | undefined;
}

/**
 * The token lifetime inputs of a CreateUserPoolClient request.
 */
export interface SimCognitoTokenValidityInput {
  readonly AccessTokenValidity?: number | undefined;
  readonly IdTokenValidity?: number | undefined;
  readonly RefreshTokenValidity?: number | undefined;
  readonly TokenValidityUnits?: SimCognitoTokenValidityUnitsType | undefined;
}

/**
 * How long each kind of token from one simulated app client lasts.
 *
 * Access and ID tokens last an hour unless the request says otherwise, and
 * refresh tokens last thirty days. Those are the values real Cognito applies,
 * and the hour is the one that catches people out: an access token outliving
 * a test is a test that never sees expiry handling run.
 */
export class SimCognitoTokenValidity {
  public readonly accessToken: SimCognitoTokenLifetime;
  public readonly idToken: SimCognitoTokenLifetime;
  public readonly refreshToken: SimCognitoTokenLifetime;

  private readonly requestedUnits: SimCognitoTokenValidityUnitsType | undefined;

  constructor(input: SimCognitoTokenValidityInput = {}) {
    const units = input.TokenValidityUnits;

    this.requestedUnits = units;
    this.accessToken = new SimCognitoTokenLifetime({
      ...accessTokenLifetimeSpec,
      validity: input.AccessTokenValidity,
      unit: units?.AccessToken,
    });
    this.idToken = new SimCognitoTokenLifetime({
      ...idTokenLifetimeSpec,
      validity: input.IdTokenValidity,
      unit: units?.IdToken,
    });
    this.refreshToken = SimCognitoTokenValidity.refreshTokenLifetime(
      input.RefreshTokenValidity,
      units?.RefreshToken,
    );
  }

  /**
   * Build the refresh token lifetime, applying the thirty days Cognito
   * substitutes both for an absent value and for a zero.
   *
   * The substituted default is thirty days whatever unit the request named,
   * so the unit is left out along with the value it would have counted.
   */
  private static refreshTokenLifetime(
    requested: number | undefined,
    unit: string | undefined,
  ): SimCognitoTokenLifetime {
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

  /**
   * The units as Cognito reports them, which is only when the request set
   * them.
   */
  unitsOutput(): SimCognitoTokenValidityUnitsType | undefined {
    return this.requestedUnits;
  }
}

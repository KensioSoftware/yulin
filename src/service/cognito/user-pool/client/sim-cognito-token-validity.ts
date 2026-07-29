import { makeSimCognitoRefreshTokenLifetime } from "./sim-cognito-refresh-token-lifetime.js";
import { SimCognitoTokenLifetime } from "./sim-cognito-token-lifetime.js";
import {
  accessTokenLifetimeSpec,
  idTokenLifetimeSpec,
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
    this.refreshToken = makeSimCognitoRefreshTokenLifetime(
      input.RefreshTokenValidity,
      units?.RefreshToken,
    );
  }

  /**
   * The units as Cognito reports them, which is only when the request set
   * them.
   */
  unitsOutput(): SimCognitoTokenValidityUnitsType | undefined {
    return this.requestedUnits;
  }
}

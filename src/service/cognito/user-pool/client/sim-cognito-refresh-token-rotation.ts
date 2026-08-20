import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";

const enabled = "ENABLED";
const disabled = "DISABLED";

const features: readonly string[] = [enabled, disabled];

/**
 * The longest grace period Cognito allows a rotated-out refresh token.
 */
const mostGraceSeconds = 60;

/**
 * The grace period a client that asked for none gets, which is none: a
 * rotated-out token stops working as soon as its replacement is issued.
 */
const defaultGraceSeconds = 0;

/**
 * The refresh token rotation setting of an app client, in the shape a request
 * sets it and a described client reports it.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_RefreshTokenRotationType.html
 */
export interface SimCognitoRefreshTokenRotationType {
  readonly Feature?: string | undefined;
  readonly RetryGracePeriodSeconds?: number | undefined;
}

/**
 * Whether an app client rotates its refresh tokens, and for how long it goes
 * on honouring the one it rotated out.
 *
 * Rotation changes which operation renews a session.
 * `GetTokensFromRefreshToken` answers a rotating client with a replacement
 * refresh token, and `REFRESH_TOKEN_AUTH` is not available to one at all.
 *
 * The grace period is what lets a client retry a request whose answer it never
 * saw: the spent token goes on working for that many seconds, so a retry with
 * it succeeds rather than signing the user out.
 */
export class SimCognitoRefreshTokenRotation {
  /**
   * The feature as the request wrote it, which is what Cognito reports back.
   */
  public readonly feature: string;

  /**
   * How many seconds a rotated-out refresh token keeps working. A client that
   * asked for no grace period gets none, so its spent token stops working the
   * moment the replacement is issued.
   */
  public readonly retryGracePeriodSeconds: number;

  private readonly requested: SimCognitoRefreshTokenRotationType | undefined;

  constructor(requested: SimCognitoRefreshTokenRotationType | undefined) {
    this.requested = requested;
    this.feature = SimCognitoRefreshTokenRotation.requireFeature(
      requested?.Feature,
    );
    this.retryGracePeriodSeconds =
      SimCognitoRefreshTokenRotation.requireGraceSeconds(
        requested?.RetryGracePeriodSeconds,
      );
  }

  private static requireFeature(value: string | undefined): string {
    if (value === undefined) {
      return disabled;
    }

    if (!features.includes(value)) {
      throw new SimCognitoInvalidParameterException(
        `RefreshTokenRotation Feature '${value}' is not a Cognito setting: ` +
          `use one of ${features.join(", ")}`,
      );
    }

    return value;
  }

  private static requireGraceSeconds(value: number | undefined): number {
    if (value === undefined) {
      return defaultGraceSeconds;
    }

    if (!Number.isSafeInteger(value) || value < 0 || value > mostGraceSeconds) {
      throw new SimCognitoInvalidParameterException(
        `RefreshTokenRotation RetryGracePeriodSeconds of ${String(value)} is ` +
          `outside the range Cognito allows: a whole number of seconds ` +
          `between 0 and ${String(mostGraceSeconds)}`,
      );
    }

    return value;
  }

  /**
   * Whether this client rotates its refresh tokens.
   */
  get enabled(): boolean {
    return this.feature === enabled;
  }

  /**
   * The setting as a described app client reports it, which is only when the
   * request set it. A client nobody configured for rotation reports none.
   */
  toOutput(): SimCognitoRefreshTokenRotationType | undefined {
    return this.requested;
  }
}

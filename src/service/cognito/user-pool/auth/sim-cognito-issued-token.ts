import { simCognitoUserPoolAdminScope } from "../token/sim-cognito-access-token.js";

interface SimCognitoIssuedTokenProperties {
  readonly value: string;
  readonly username: string;
  readonly clientId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;

  /**
   * The scopes the sign-in this token came from was granted, which a refresh
   * gives the tokens it hands out next.
   */
  readonly scopes?: readonly string[] | undefined;

  /**
   * When this token stops being honoured, where something has spent it before
   * its expiry. A refresh token that has been rotated out has one, set to the
   * end of the app client's retry grace period.
   */
  readonly revokedAt?: Date | undefined;
}

/**
 * One token a pool has issued, as the pool remembers it.
 *
 * A refresh token is remembered because the pool is what exchanges it later,
 * and an access token because the pool is what a sign-out presents one to. The
 * token this describes is the string the caller holds: an access token is a
 * signed JWT and a refresh token is opaque, and neither says anything to this
 * pool that this record does not.
 */
export class SimCognitoIssuedToken {
  public readonly value: string;
  public readonly username: string;
  public readonly clientId: string;
  public readonly issuedAt: Date;
  public readonly expiresAt: Date;

  /**
   * The scopes the sign-in was granted, which a token from the API carries
   * none of: the scope of one of those is settled where the token is signed.
   */
  public readonly scopes: readonly string[];

  /**
   * When a rotated-out refresh token stops working, which is undefined for
   * every token nothing has replaced.
   */
  public readonly revokedAt: Date | undefined;

  constructor(properties: SimCognitoIssuedTokenProperties) {
    this.value = properties.value;
    this.username = properties.username;
    this.clientId = properties.clientId;
    this.issuedAt = properties.issuedAt;
    this.expiresAt = properties.expiresAt;
    this.scopes = properties.scopes ?? [];
    this.revokedAt = properties.revokedAt;
  }

  /**
   * Whether this token may act on the user it was issued to.
   *
   * Real Cognito refuses an operation a user performs on itself where the
   * access token does not carry `aws.cognito.signin.user.admin`. A token from
   * an API sign-in always carries it, which is what an empty scope list here
   * means, and a hosted sign-in carries it only where the app client asked for
   * it among its `AllowedOAuthScopes`.
   */
  get actsForUser(): boolean {
    return (
      this.scopes.length === 0 ||
      this.scopes.includes(simCognitoUserPoolAdminScope)
    );
  }

  /**
   * Whether this token has run out by a given moment.
   */
  isExpiredAt(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  /**
   * Whether this token has been spent by a rotation that replaced it.
   */
  isRevokedAt(now: Date): boolean {
    return this.revokedAt !== undefined && now >= this.revokedAt;
  }

  /**
   * Whether this token is worth remembering any longer.
   */
  isSpentAt(now: Date): boolean {
    return this.isExpiredAt(now) || this.isRevokedAt(now);
  }

  /**
   * This token as it is once a rotation has replaced it.
   *
   * It goes on working until the app client's retry grace period is up, so a
   * client retrying a request whose answer it never saw is answered rather
   * than signed out. A token already rotated out keeps the window it was
   * given, so retrying inside the grace period does not extend it.
   */
  rotatedOutAt(revokedAt: Date): SimCognitoIssuedToken {
    if (this.revokedAt !== undefined) {
      return this;
    }

    return new SimCognitoIssuedToken({ ...this.parts(), revokedAt });
  }

  /**
   * The token that replaces this one when a rotation spends it.
   *
   * The replacement runs out when this token would have, rather than starting
   * a fresh `RefreshTokenValidity`, which is what real Cognito does: rotating
   * a session cannot extend it indefinitely.
   */
  replacedBy(value: string, issuedAt: Date): SimCognitoIssuedToken {
    return new SimCognitoIssuedToken({
      ...this.parts(),
      value,
      issuedAt,
      revokedAt: undefined,
    });
  }

  /**
   * Whether this token was issued to an app client.
   *
   * A refresh token belongs to the client that got it, so presenting one to
   * another client fails, as it does on real Cognito.
   */
  isFor(clientId: string): boolean {
    return this.clientId === clientId;
  }

  /**
   * What this token is made of, so a copy of it can be made with one part
   * changed.
   */
  private parts(): SimCognitoIssuedTokenProperties {
    return {
      value: this.value,
      username: this.username,
      clientId: this.clientId,
      issuedAt: this.issuedAt,
      expiresAt: this.expiresAt,
      scopes: this.scopes,
      revokedAt: this.revokedAt,
    };
  }
}

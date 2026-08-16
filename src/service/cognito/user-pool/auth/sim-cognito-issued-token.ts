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

  constructor(properties: SimCognitoIssuedTokenProperties) {
    this.value = properties.value;
    this.username = properties.username;
    this.clientId = properties.clientId;
    this.issuedAt = properties.issuedAt;
    this.expiresAt = properties.expiresAt;
    this.scopes = properties.scopes ?? [];
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
   * Whether this token was issued to an app client.
   *
   * A refresh token belongs to the client that got it, so presenting one to
   * another client fails, as it does on real Cognito.
   */
  isFor(clientId: string): boolean {
    return this.clientId === clientId;
  }
}

interface SimCognitoIssuedTokenProperties {
  readonly value: string;
  readonly username: string;
  readonly clientId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
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

  constructor(properties: SimCognitoIssuedTokenProperties) {
    this.value = properties.value;
    this.username = properties.username;
    this.clientId = properties.clientId;
    this.issuedAt = properties.issuedAt;
    this.expiresAt = properties.expiresAt;
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

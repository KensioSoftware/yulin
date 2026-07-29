import { randomBytes } from "node:crypto";

/**
 * How long a challenge session lasts.
 *
 * Real Cognito gives an app client an `AuthSessionValidity` of three minutes
 * unless the client says otherwise, and `CreateUserPoolClient` refuses that
 * input here, so three minutes is what every session gets.
 */
const sessionMinutes = 3;

const sessionBytes = 48;

interface SimCognitoAuthSessionProperties {
  readonly username: string;
  readonly clientId: string;
  readonly challengeName: string;
  readonly issuedAt: Date;
}

/**
 * One challenge session, which is what an unfinished authentication carries
 * between the request that started it and the response that completes it.
 *
 * The session is opaque, single use, and tied to the user and app client that
 * got it: a session from one sign-in cannot complete another.
 */
export class SimCognitoAuthSession {
  public readonly id: string;
  public readonly username: string;
  public readonly clientId: string;
  public readonly challengeName: string;
  public readonly issuedAt: Date;

  constructor(properties: SimCognitoAuthSessionProperties) {
    this.id = randomBytes(sessionBytes).toString("base64url");
    this.username = properties.username;
    this.clientId = properties.clientId;
    this.challengeName = properties.challengeName;
    this.issuedAt = properties.issuedAt;
  }

  /**
   * Whether this session has run out by a given moment.
   */
  isExpiredAt(now: Date): boolean {
    const expiresAt = new Date(
      this.issuedAt.getTime() + sessionMinutes * 60 * 1000,
    );

    return now.getTime() >= expiresAt.getTime();
  }

  /**
   * Whether this session belongs to a user and app client.
   */
  belongsTo(username: string, clientId: string): boolean {
    return this.username === username && this.clientId === clientId;
  }
}

import { randomBytes } from "node:crypto";
import type { SimCognitoUserPoolClient } from "../client/sim-cognito-user-pool-client.js";

const sessionBytes = 48;

interface SimCognitoAuthSessionProperties {
  readonly username: string;

  /**
   * The app client the sign-in is running through, which is what says how
   * long the session lasts: its `AuthSessionValidity`.
   */
  readonly client: SimCognitoUserPoolClient;
  readonly challengeName: string;
  readonly issuedAt: Date;

  /**
   * The code the challenge sent the user, for a challenge that sent one.
   *
   * An `SMS_MFA` code lives here rather than on the user because it belongs to
   * this one challenge: it goes when the session goes, so a code from an
   * abandoned sign-in cannot complete a later one. A `SOFTWARE_TOKEN_MFA`
   * challenge has none, because the code is whatever the user's authenticator
   * app is showing.
   */
  readonly code?: string | undefined;
}

/**
 * One challenge session, which is what an unfinished authentication carries
 * between the request that started it and the response that completes it.
 *
 * The session is opaque, single use, and tied to the user and app client that
 * got it: a session from one sign-in cannot complete another. How long it can
 * be answered for is the app client's `AuthSessionValidity`, which is three
 * minutes on a client that asked for none.
 */
export class SimCognitoAuthSession {
  public readonly id: string;
  public readonly username: string;
  public readonly clientId: string;
  public readonly challengeName: string;
  public readonly issuedAt: Date;

  /**
   * When this session runs out, which the app client's `AuthSessionValidity`
   * decides. It is settled here rather than read back off the client, so a
   * client updated mid-sign-in does not move the deadline of a challenge it
   * has already issued.
   */
  public readonly expiresAt: Date;

  /** The code this challenge sent, where it sent one. */
  public readonly code: string | undefined;

  constructor(properties: SimCognitoAuthSessionProperties) {
    this.id = randomBytes(sessionBytes).toString("base64url");
    this.username = properties.username;
    this.clientId = properties.client.id;
    this.challengeName = properties.challengeName;
    this.issuedAt = properties.issuedAt;
    this.expiresAt = properties.client.authSessionValidity.expiryOf(
      properties.issuedAt,
    );
    this.code = properties.code;
  }

  /**
   * Whether this session has run out by a given moment.
   */
  isExpiredAt(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  /**
   * Whether this session belongs to a user and app client.
   */
  belongsTo(username: string, clientId: string): boolean {
    return this.username === username && this.clientId === clientId;
  }

  /**
   * Whether this session was issued for the challenge being answered.
   *
   * A session carries one challenge, so answering an `SMS_MFA` challenge with
   * the session from a `NEW_PASSWORD_REQUIRED` one is no more a valid session
   * than one from another user.
   */
  answers(challengeName: string): boolean {
    return this.challengeName === challengeName;
  }
}

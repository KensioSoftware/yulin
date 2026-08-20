import { randomUUID } from "node:crypto";

/**
 * How long a managed login session lasts.
 *
 * Real Cognito gives the browser an hour, and nothing configures that. Signing
 * in from the session leaves the hour where it started, so a browser signing
 * in from the same cookie all morning is asked for credentials again at the
 * end of the first hour.
 */
const sessionMinutes = 60;

interface SimCognitoManagedLoginSessionProperties {
  readonly username: string;
  readonly startedAt: Date;
}

/**
 * One managed login session, which is what signs a returning browser in
 * without asking for a password again.
 *
 * Real managed login keeps this in the `cognito` cookie on the pool's domain.
 * The value is opaque, and the user it signed in is all it carries, because a
 * sign-in from the session issues a code the same way the first sign-in did.
 */
export class SimCognitoManagedLoginSession {
  public readonly value: string;
  public readonly username: string;
  public readonly startedAt: Date;

  constructor(properties: SimCognitoManagedLoginSessionProperties) {
    this.value = randomUUID();
    this.username = properties.username;
    this.startedAt = properties.startedAt;
  }

  /**
   * Whether this session has run out by a given moment.
   */
  isExpiredAt(now: Date): boolean {
    const expiresAt = new Date(
      this.startedAt.getTime() + sessionMinutes * 60_000,
    );

    return now.getTime() >= expiresAt.getTime();
  }
}

import { randomUUID } from "node:crypto";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  type SimCognitoAttributeType,
  SimCognitoUserAttributes,
} from "./sim-cognito-user-attributes.js";
import { SimCognitoUser } from "./sim-cognito-user.js";
import { SimCognitoUserPassword } from "./sim-cognito-user-password.js";
import { SimCognitoUserStatus } from "./sim-cognito-user-status.js";
import type { SimCognitoUsername } from "./sim-cognito-username.js";

interface SimCognitoUserFactoryProperties {
  readonly clock: SimClock;
}

interface SimCognitoMakeUserProperties {
  readonly username: SimCognitoUsername;
  readonly attributes?: readonly SimCognitoAttributeType[] | undefined;
  /**
   * The password the user starts with, already checked against the pool's
   * policy. A user made without one has no password at all.
   */
  readonly temporaryPassword?: string | undefined;
}

interface SimCognitoSignUpUserProperties {
  readonly username: SimCognitoUsername;
  readonly attributes?: readonly SimCognitoAttributeType[] | undefined;
  /**
   * The password the user chose, already checked against the pool's policy.
   * It is the user's own rather than a temporary one, so the user signs in
   * with it as soon as it is confirmed.
   */
  readonly password: string;
}

/**
 * Builds simulated users, including the `sub` Cognito allocates.
 */
export class SimCognitoUserFactory {
  private readonly clock: SimClock;

  constructor(properties: SimCognitoUserFactoryProperties) {
    this.clock = properties.clock;
  }

  private static passwordFor(
    temporaryPassword: string | undefined,
  ): SimCognitoUserPassword | undefined {
    if (temporaryPassword === undefined) {
      return undefined;
    }

    return new SimCognitoUserPassword(temporaryPassword);
  }

  /**
   * Make a new user for a pool.
   *
   * The `sub` is a fresh UUID rather than anything derived from the username,
   * as it is on real Cognito. Code that treats the two as interchangeable
   * therefore fails here rather than in a deployment.
   */
  make(properties: SimCognitoMakeUserProperties): SimCognitoUser {
    return new SimCognitoUser({
      username: properties.username,
      sub: randomUUID(),
      attributes: new SimCognitoUserAttributes(properties.attributes),
      password: SimCognitoUserFactory.passwordFor(properties.temporaryPassword),
      clock: this.clock,
    });
  }

  /**
   * Make a user that signed itself up, waiting to be confirmed.
   *
   * The user starts in `UNCONFIRMED` holding the confirmation code it gets
   * with that status, which is where real Cognito leaves a `SignUp`.
   */
  signUp(properties: SimCognitoSignUpUserProperties): SimCognitoUser {
    return new SimCognitoUser({
      username: properties.username,
      sub: randomUUID(),
      attributes: new SimCognitoUserAttributes(properties.attributes),
      password: new SimCognitoUserPassword(properties.password),
      status: SimCognitoUserStatus.unconfirmed,
      clock: this.clock,
    });
  }
}

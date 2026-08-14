import { randomUUID } from "node:crypto";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCognitoFederatedIdentity } from "../idp/sim-cognito-federated-identity.js";
import { SimCognitoPasswordCheck } from "../sim-cognito-password-check.js";
import type { SimCognitoPasswordPolicy } from "../sim-cognito-password-policy.js";
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
   * The password the user starts with, checked here against the pool's policy.
   * A user made without one has no password at all.
   */
  readonly temporaryPassword?: string | undefined;

  /** The policy the pool holds its users' passwords to. */
  readonly passwordPolicy: SimCognitoPasswordPolicy;
}

interface SimCognitoFederatedUserProperties {
  readonly username: SimCognitoUsername;
  readonly attributes?: readonly SimCognitoAttributeType[] | undefined;

  /** Which provider signed the user in, and which subject it signed in as. */
  readonly identity: SimCognitoFederatedIdentity;
}

interface SimCognitoSignUpUserProperties {
  readonly username: SimCognitoUsername;
  readonly attributes?: readonly SimCognitoAttributeType[] | undefined;

  /**
   * The password the user chose, checked here against the pool's policy. It is
   * the user's own rather than a temporary one, so the user signs in with it
   * as soon as it is confirmed.
   */
  readonly password: string | undefined;

  /** The policy the pool holds its users' passwords to. */
  readonly passwordPolicy: SimCognitoPasswordPolicy;
}

/**
 * Builds simulated users, including the `sub` Cognito allocates.
 */
export class SimCognitoUserFactory {
  private readonly clock: SimClock;

  constructor(properties: SimCognitoUserFactoryProperties) {
    this.clock = properties.clock;
  }

  /**
   * The password a user starts with, checked against the pool's policy.
   *
   * `AdminCreateUser` naming no `TemporaryPassword` leaves the user with no
   * password at all: real Cognito generates one and sends it to the user, and
   * the invitation this simulation records carries no password to read.
   */
  private static passwordFor(
    field: string,
    given: string | undefined,
    policy: SimCognitoPasswordPolicy,
  ): SimCognitoUserPassword | undefined {
    if (given === undefined) {
      return undefined;
    }

    return new SimCognitoUserPassword(
      new SimCognitoPasswordCheck(policy).require(field, given),
    );
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
      password: SimCognitoUserFactory.passwordFor(
        "TemporaryPassword",
        properties.temporaryPassword,
        properties.passwordPolicy,
      ),
      clock: this.clock,
    });
  }

  /**
   * Make a user for an external subject an identity provider signed in.
   *
   * The user has no password at all, because its password is at the provider:
   * real Cognito leaves a federated user in `EXTERNAL_PROVIDER`, where the
   * pool's own sign-in flows refuse it.
   */
  federated(properties: SimCognitoFederatedUserProperties): SimCognitoUser {
    return new SimCognitoUser({
      username: properties.username,
      sub: randomUUID(),
      attributes: new SimCognitoUserAttributes(properties.attributes),
      status: SimCognitoUserStatus.externalProvider,
      identity: properties.identity,
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
      // The password a user chose is required, where the temporary one an
      // administrator gives is not.
      password: new SimCognitoUserPassword(
        new SimCognitoPasswordCheck(properties.passwordPolicy).require(
          "Password",
          properties.password,
        ),
      ),
      status: SimCognitoUserStatus.unconfirmed,
      clock: this.clock,
    });
  }
}

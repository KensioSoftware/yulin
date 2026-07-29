import { randomUUID } from "node:crypto";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  type SimCognitoAttributeType,
  SimCognitoUserAttributes,
} from "./sim-cognito-user-attributes.js";
import { SimCognitoUser } from "./sim-cognito-user.js";
import type { SimCognitoUsername } from "./sim-cognito-username.js";

interface SimCognitoUserFactoryProperties {
  readonly clock: SimClock;
}

interface SimCognitoMakeUserProperties {
  readonly username: SimCognitoUsername;
  readonly attributes?: readonly SimCognitoAttributeType[] | undefined;
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
      clock: this.clock,
    });
  }
}

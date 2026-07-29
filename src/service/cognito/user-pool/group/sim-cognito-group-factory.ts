import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import { SimCognitoGroup } from "./sim-cognito-group.js";
import type { SimCognitoGroupName } from "./sim-cognito-group-name.js";
import type { SimCognitoGroupSettings } from "./sim-cognito-group-settings.js";

interface SimCognitoGroupFactoryProperties {
  readonly clock: SimClock;
}

interface SimCognitoMakeGroupProperties {
  readonly pool: SimCognitoUserPool;
  readonly name: SimCognitoGroupName;
  readonly settings: SimCognitoGroupSettings;
}

/**
 * Builds simulated groups, which start with no members.
 */
export class SimCognitoGroupFactory {
  private readonly clock: SimClock;

  constructor(properties: SimCognitoGroupFactoryProperties) {
    this.clock = properties.clock;
  }

  /**
   * Make a new group for a pool.
   */
  make(properties: SimCognitoMakeGroupProperties): SimCognitoGroup {
    return new SimCognitoGroup({
      name: properties.name,
      userPoolId: properties.pool.id,
      settings: properties.settings,
      clock: this.clock,
    });
  }
}

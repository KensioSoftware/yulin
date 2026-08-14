import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimElbV2Stores } from "../sim-elbv2-stores.js";
import type { SimElbV2Authorizer } from "./authorize/sim-elbv2-authorizer.js";

/**
 * What every simulated ELBv2 command handler is built with.
 */
export interface SimElbV2CommandHandlerProperties {
  readonly stores: SimElbV2Stores;
  readonly authorizer: SimElbV2Authorizer;
  readonly background: BackgroundScheduler;
}

/**
 * The collaborators every simulated ELBv2 command handler holds.
 *
 * All nineteen operations read or write the same four stores, authorize
 * against the same IAM, and wait at the same sequencing point, so those three
 * are held here rather than declared and assigned in each handler. What is
 * left in a handler is what that operation alone needs.
 */
export abstract class SimElbV2CommandHandler {
  protected readonly stores: SimElbV2Stores;
  protected readonly authorizer: SimElbV2Authorizer;
  protected readonly background: BackgroundScheduler;

  constructor(properties: SimElbV2CommandHandlerProperties) {
    this.stores = properties.stores;
    this.authorizer = properties.authorizer;
    this.background = properties.background;
  }
}

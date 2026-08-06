import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import { SimCognitoUnsimulatedUserPoolOptions } from "./sim-cognito-unsimulated-pool-options.js";
import type { SimUpdateUserPoolCommandInput } from "./user-pool.command.js";

/**
 * Refuses the UpdateUserPool inputs this simulation does not model.
 *
 * An update carries the same settings a creation does, and they are refused
 * in the same words, saying `UpdateUserPool`.
 *
 * `PoolName` is the one input only an update refuses. Real `UpdateUserPool`
 * renames the pool with it, and a rename is not simulated, so a request
 * carrying one is refused rather than answered with a pool still under its
 * old name.
 */
export class SimCognitoUnsimulatedUserPoolUpdates {
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "UpdateUserPool",
  );
  private readonly options = new SimCognitoUnsimulatedUserPoolOptions(
    "UpdateUserPool",
  );

  /**
   * Refuse an update carrying an input this simulation cannot honour.
   */
  refuseIn(input: SimUpdateUserPoolCommandInput): void {
    this.unsimulated.refuse("PoolName", input.PoolName, "renaming a pool");

    this.options.refuseIn(input);
  }
}

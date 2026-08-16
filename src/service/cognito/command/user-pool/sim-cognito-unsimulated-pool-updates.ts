import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
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
 *
 * `Schema` is refused for a different reason: real `UpdateUserPool` has no
 * such input at all, and a request carrying one would change a pool's
 * attributes here and nothing on AWS.
 */
export class SimCognitoUnsimulatedUserPoolUpdates {
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "UpdateUserPool",
  );
  private readonly options = new SimCognitoUnsimulatedUserPoolOptions(
    "UpdateUserPool",
  );

  /**
   * Refuse an update declaring a schema.
   *
   * A pool's schema is fixed when the pool is created. Real Cognito adds an
   * attribute to one with `AddCustomAttributes`, which is not simulated, and
   * takes nothing of the sort on `UpdateUserPool`.
   */
  private static refuseSchema(schema: readonly object[] | undefined): void {
    if (schema === undefined) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      "UpdateUserPool Schema is not an input real Cognito has: a pool's " +
        "schema is fixed when the pool is created, and AddCustomAttributes " +
        "is what adds an attribute to one, which is not simulated",
    );
  }

  /**
   * Refuse an update carrying an input this simulation cannot honour.
   */
  refuseIn(input: SimUpdateUserPoolCommandInput): void {
    this.unsimulated.refuse("PoolName", input.PoolName, "renaming a pool");

    SimCognitoUnsimulatedUserPoolUpdates.refuseSchema(input.Schema);
    this.options.refuseIn(input);
  }
}

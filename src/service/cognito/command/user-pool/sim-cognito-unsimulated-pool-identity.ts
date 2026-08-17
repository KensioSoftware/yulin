import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimCreateUserPoolCommandInput } from "./user-pool.command.js";

/**
 * Refuses the inputs deciding how a pool identifies its users that this
 * simulation does not model.
 *
 * Both are `CreateUserPool` inputs only. Real Cognito fixes each of them when
 * the pool is made and has no `UpdateUserPool` input for either, so the
 * refusals only ever name creation.
 *
 * `Schema` and `UsernameAttributes` are the other two such inputs and are not
 * refused: a pool takes the attributes it declares, and a pool that signs
 * users in by one of them stores the generated UUID username real Cognito
 * would have stored.
 */
export class SimCognitoUnsimulatedUserPoolIdentity {
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "CreateUserPool",
  );

  /**
   * Refuse a request choosing how its users are identified.
   */
  refuseIn(input: SimCreateUserPoolCommandInput): void {
    this.unsimulated.refuse(
      "AliasAttributes",
      input.AliasAttributes,
      "sign-in aliases",
    );
    this.unsimulated.refuse(
      "UsernameConfiguration",
      input.UsernameConfiguration,
      "case-insensitive usernames",
    );
  }
}

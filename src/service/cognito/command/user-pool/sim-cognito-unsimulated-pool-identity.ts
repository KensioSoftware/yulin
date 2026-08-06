import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimCreateUserPoolCommandInput } from "./user-pool.command.js";

/**
 * Refuses the inputs deciding how a pool identifies its users.
 *
 * These four are `CreateUserPool` inputs only. Real Cognito fixes each of
 * them when the pool is made and has no `UpdateUserPool` input for any of
 * them, so the refusals only ever name creation.
 *
 * `UsernameAttributes` is the one that would hurt most, and it gets its own
 * refusal saying why.
 */
export class SimCognitoUnsimulatedUserPoolIdentity {
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "CreateUserPool",
  );

  /**
   * Refuse a request choosing how its users are identified.
   */
  refuseIn(input: SimCreateUserPoolCommandInput): void {
    this.refuseUsernameAttributes(input.UsernameAttributes);

    this.unsimulated.refuse(
      "AliasAttributes",
      input.AliasAttributes,
      "sign-in aliases",
    );
    this.unsimulated.refuse("Schema", input.Schema, "custom attributes");
    this.unsimulated.refuse(
      "UsernameConfiguration",
      input.UsernameConfiguration,
      "case-insensitive usernames",
    );
  }

  /**
   * Refuse a pool that signs users in by an attribute rather than by
   * username.
   *
   * Such a pool stores a generated UUID as the username, so code written
   * against it looks users up by something this simulation would not have
   * given them.
   */
  private refuseUsernameAttributes(
    attributes: readonly string[] | undefined,
  ): void {
    if (attributes === undefined) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      "CreateUserPool UsernameAttributes is not simulated: a pool that signs " +
        "users in by email or phone number stores a generated UUID as the " +
        "username, so simulating the pool without that would answer with the " +
        "wrong username here and the right one on real AWS",
    );
  }
}

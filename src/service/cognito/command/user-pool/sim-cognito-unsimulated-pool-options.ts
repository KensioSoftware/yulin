import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import { SimCognitoUnsimulatedUserPoolFeatures } from "./sim-cognito-unsimulated-pool-features.js";
import { SimCognitoUnsimulatedUserPoolMessaging } from "./sim-cognito-unsimulated-pool-messaging.js";
import type { SimCreateUserPoolCommandInput } from "./user-pool.command.js";

/**
 * Refuses the CreateUserPool inputs this simulation does not model.
 *
 * Every one of these changes what the pool does on real AWS, so ignoring any
 * of them would let a request succeed here and behave differently in a
 * deployment. `UsernameAttributes` is the one that would hurt most, and it
 * gets its own refusal saying why.
 */
export class SimCognitoUnsimulatedUserPoolOptions {
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "CreateUserPool",
  );
  private readonly features = new SimCognitoUnsimulatedUserPoolFeatures();
  private readonly messaging = new SimCognitoUnsimulatedUserPoolMessaging();

  /**
   * Refuse a request carrying an input this simulation cannot honour.
   */
  refuseIn(input: SimCreateUserPoolCommandInput): void {
    this.refuseUsernameAttributes(input.UsernameAttributes);

    this.unsimulated.refuseUnless(
      "MfaConfiguration",
      input.MfaConfiguration,
      "OFF",
      "multi-factor authentication",
    );
    this.unsimulated.refuseUnless(
      "UserPoolTier",
      input.UserPoolTier,
      "ESSENTIALS",
      "the Lite and Plus feature plans",
    );
    this.unsimulated.refuse(
      "Policies SignInPolicy",
      input.Policies?.SignInPolicy,
      "choosing which factors a user may sign in with first",
    );
    this.unsimulated.refuse(
      "Policies PasswordPolicy PasswordHistorySize",
      input.Policies?.PasswordPolicy?.PasswordHistorySize,
      "refusing a password the user has used before",
    );

    this.features.refuseIn(input);
    this.messaging.refuseIn(input);
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

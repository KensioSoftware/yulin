import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import { SimCognitoUnsimulatedUserPoolFeatures } from "./sim-cognito-unsimulated-pool-features.js";
import { SimCognitoUnsimulatedUserPoolMessaging } from "./sim-cognito-unsimulated-pool-messaging.js";
import type { SimCognitoUserPoolCommandInput } from "./user-pool.command.js";

/**
 * Refuses the pool inputs this simulation does not model.
 *
 * Every one of these changes what the pool does on real AWS, so ignoring any
 * of them would let a request succeed here and behave differently in a
 * deployment.
 *
 * `CreateUserPool` and `UpdateUserPool` both carry them, so both refuse them,
 * each naming itself in the refusal.
 */
export class SimCognitoUnsimulatedUserPoolOptions {
  private readonly unsimulated: SimCognitoUnsimulatedInput;
  private readonly features: SimCognitoUnsimulatedUserPoolFeatures;
  private readonly messaging: SimCognitoUnsimulatedUserPoolMessaging;

  constructor(operation: string) {
    this.unsimulated = new SimCognitoUnsimulatedInput(operation);
    this.features = new SimCognitoUnsimulatedUserPoolFeatures(operation);
    this.messaging = new SimCognitoUnsimulatedUserPoolMessaging(operation);
  }

  /**
   * Refuse a request carrying an input this simulation cannot honour.
   */
  refuseIn(input: SimCognitoUserPoolCommandInput): void {
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
}

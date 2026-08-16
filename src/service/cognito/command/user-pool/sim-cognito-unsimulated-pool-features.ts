import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimCognitoUserPoolCommandInput } from "./user-pool.command.js";

/**
 * Refuses the user pool features this simulation does not model.
 *
 * These are the settings that decide what a pool does with its users. Most of
 * them cannot be honoured here at all, and a pool created as if they had been
 * would behave differently in a deployment.
 *
 * `AccountRecoverySetting` is not here. A pool records the mechanisms it was
 * asked for and reports them back, and SimCognitoAccountRecovery refuses a
 * setting outside the shape Cognito states for it.
 *
 * `AdminCreateUserConfig` is simulated as far as `AllowAdminCreateUserOnly`
 * goes, which is what decides whether `SignUp` is allowed. The two keys beside
 * it are about the invitation an admin-created user is sent, and no message is
 * ever delivered here, so those are refused.
 *
 * `LambdaConfig` is not here. The triggers a pool can run are read by
 * SimCognitoLambdaConfig, which accepts the two this simulation fires and
 * refuses the rest one key at a time, so a pool can have a trigger without
 * having every trigger.
 */
export class SimCognitoUnsimulatedUserPoolFeatures {
  private readonly unsimulated: SimCognitoUnsimulatedInput;

  constructor(operation: string) {
    this.unsimulated = new SimCognitoUnsimulatedInput(operation);
  }

  /**
   * Refuse a request carrying a feature this simulation cannot honour.
   */
  refuseIn(input: SimCognitoUserPoolCommandInput): void {
    this.unsimulated.refuse(
      "UserAttributeUpdateSettings",
      input.UserAttributeUpdateSettings,
      "verification before an attribute changes",
    );
    this.unsimulated.refuse(
      "DeviceConfiguration",
      input.DeviceConfiguration,
      "device remembering",
    );
    this.unsimulated.refuse(
      "AdminCreateUserConfig InviteMessageTemplate",
      input.AdminCreateUserConfig?.InviteMessageTemplate,
      "the wording of the invitation an admin-created user is sent",
    );
    this.unsimulated.refuse(
      "AdminCreateUserConfig UnusedAccountValidityDays",
      input.AdminCreateUserConfig?.UnusedAccountValidityDays,
      "expiring the temporary password an admin-created user was sent",
    );
    this.unsimulated.refuse(
      "UserPoolAddOns",
      input.UserPoolAddOns,
      "threat protection",
    );
    this.unsimulated.refuse(
      "KeyConfiguration",
      input.KeyConfiguration,
      "encryption under a customer managed key",
    );
    this.unsimulated.refuse(
      "IssuerConfiguration",
      input.IssuerConfiguration,
      "a custom token issuer",
    );
    this.unsimulated.refuse("UserPoolTags", input.UserPoolTags, "tags");
  }
}

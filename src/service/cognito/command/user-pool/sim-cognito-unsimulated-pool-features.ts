import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimCreateUserPoolCommandInput } from "./user-pool.command.js";

/**
 * Refuses the user pool features this simulation does not model.
 *
 * These are the settings that decide what a pool does with its users. None of
 * them can be honoured here, and a pool created as if they had been would
 * behave differently in a deployment.
 */
export class SimCognitoUnsimulatedUserPoolFeatures {
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "CreateUserPool",
  );

  /**
   * Refuse a request carrying a feature this simulation cannot honour.
   */
  refuseIn(input: SimCreateUserPoolCommandInput): void {
    this.unsimulated.refuse(
      "LambdaConfig",
      input.LambdaConfig,
      "Lambda triggers",
    );
    this.unsimulated.refuse(
      "AliasAttributes",
      input.AliasAttributes,
      "sign-in aliases",
    );
    this.unsimulated.refuse(
      "AutoVerifiedAttributes",
      input.AutoVerifiedAttributes,
      "automatic attribute verification",
    );
    this.unsimulated.refuse("Schema", input.Schema, "custom attributes");
    this.unsimulated.refuse(
      "UsernameConfiguration",
      input.UsernameConfiguration,
      "case-insensitive usernames",
    );
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
      "AccountRecoverySetting",
      input.AccountRecoverySetting,
      "account recovery",
    );
    this.unsimulated.refuse(
      "AdminCreateUserConfig",
      input.AdminCreateUserConfig,
      "the AdminCreateUser settings",
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

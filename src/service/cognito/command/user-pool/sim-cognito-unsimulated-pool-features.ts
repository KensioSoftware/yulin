import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import { SimCognitoUnsimulatedStructure } from "../sim-cognito-unsimulated-structure.js";
import type { SimCreateUserPoolCommandInput } from "./user-pool.command.js";

/**
 * The account recovery a pool is accepted with, which is what `aws-cdk-lib`
 * 2.262.1 emits for a `UserPool` construct asking for nothing in particular.
 *
 * There is no `ForgotPassword` command here, so no mechanism is ever reached
 * whichever ones are listed. A request listing its own is still refused,
 * because choosing them is choosing behaviour, and a pool that ignored the
 * choice would recover accounts differently on real AWS.
 */
const accountRecoverySetting = {
  RecoveryMechanisms: [
    { Name: "verified_phone_number", Priority: 1 },
    { Name: "verified_email", Priority: 2 },
  ],
};

/**
 * Refuses the user pool features this simulation does not model.
 *
 * These are the settings that decide what a pool does with its users. Most of
 * them cannot be honoured here at all, and a pool created as if they had been
 * would behave differently in a deployment.
 *
 * `AccountRecoverySetting` is accepted at one value and refused at every
 * other. That value asks for nothing this simulation does not do, and it is
 * what CDK emits, so a stack that only wanted a pool deploys.
 *
 * `AdminCreateUserConfig` is simulated as far as `AllowAdminCreateUserOnly`
 * goes, which is what decides whether `SignUp` is allowed. The two keys beside
 * it are about the invitation an admin-created user is sent, and no message is
 * ever delivered here, so those are refused.
 *
 * `LambdaConfig` is not here either. The triggers a pool can run are read by
 * SimCognitoLambdaConfig, which accepts the two this simulation fires and
 * refuses the rest one key at a time, so a pool can have a trigger without
 * having every trigger.
 */
export class SimCognitoUnsimulatedUserPoolFeatures {
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "CreateUserPool",
  );
  private readonly structure = new SimCognitoUnsimulatedStructure(
    "CreateUserPool",
  );

  /**
   * Refuse a request carrying a feature this simulation cannot honour.
   */
  refuseIn(input: SimCreateUserPoolCommandInput): void {
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
    this.structure.refuseUnless(
      "AccountRecoverySetting",
      input.AccountRecoverySetting,
      accountRecoverySetting,
      "account recovery",
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

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
 * The AdminCreateUser configuration a pool is accepted with.
 *
 * `AllowAdminCreateUserOnly: true` says only an administrator creates users,
 * which is all `AdminCreateUser` does here, so accepting it promises nothing
 * this simulation does not already do. `false` says users may sign themselves
 * up, and there is no `SignUp` command to do that with, so it is refused.
 *
 * That asymmetry is deliberately stricter than AWS, whose own default for the
 * field is `false`. CDK emits `true`, which is why the accepted value is the
 * one that is safe rather than the one AWS defaults to.
 */
const adminCreateUserConfig = { AllowAdminCreateUserOnly: true };

/**
 * Refuses the user pool features this simulation does not model.
 *
 * These are the settings that decide what a pool does with its users. Most of
 * them cannot be honoured here at all, and a pool created as if they had been
 * would behave differently in a deployment.
 *
 * Two are accepted at one value each, and refused at every other. Neither
 * value asks for anything this simulation does not do, and both are what CDK
 * emits, so a stack that only wanted a pool deploys.
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
    this.structure.refuseUnless(
      "AccountRecoverySetting",
      input.AccountRecoverySetting,
      accountRecoverySetting,
      "account recovery",
    );
    this.structure.refuseUnless(
      "AdminCreateUserConfig",
      input.AdminCreateUserConfig,
      adminCreateUserConfig,
      "self-service sign-up and the invitation an admin-created user is sent",
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

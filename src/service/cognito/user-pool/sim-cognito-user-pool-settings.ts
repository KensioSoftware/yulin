import {
  SimCognitoAdminCreateUserConfig,
  type SimCognitoAdminCreateUserConfigType,
} from "./sim-cognito-admin-create-user-config.js";
import { SimCognitoAutoVerifiedAttributes } from "./sim-cognito-auto-verified-attributes.js";
import { SimCognitoDeletionProtection } from "./sim-cognito-deletion-protection.js";
import {
  SimCognitoPasswordPolicy,
  type SimCognitoUserPoolPoliciesType,
} from "./sim-cognito-password-policy.js";
import {
  SimCognitoVerificationMessages,
  type SimCognitoVerificationMessagesType,
} from "./message/sim-cognito-verification-messages.js";
import {
  SimCognitoUnsimulatedPoolSettings,
  type SimCognitoUnsimulatedPoolSettingsType,
} from "./sim-cognito-unsimulated-pool-settings.js";
import { SimCognitoLambdaConfig } from "./trigger/sim-cognito-lambda-config.js";

/**
 * The pool settings a request can set, in the shape the SDK sends them.
 *
 * `CreateUserPool` and `UpdateUserPool` both carry these, which is what lets
 * an update build a pool's settings the same way a creation does.
 */
export interface SimCognitoUserPoolSettingsInput
  extends
    SimCognitoUnsimulatedPoolSettingsType,
    SimCognitoVerificationMessagesType {
  readonly Policies?: SimCognitoUserPoolPoliciesType | undefined;
  readonly DeletionProtection?: string | undefined;
  readonly AdminCreateUserConfig?:
    SimCognitoAdminCreateUserConfigType | undefined;
  readonly AutoVerifiedAttributes?: readonly string[] | undefined;
  readonly LambdaConfig?: object | undefined;
}

interface SimCognitoUserPoolSettingsProperties {
  readonly input: SimCognitoUserPoolSettingsInput;

  /**
   * The operation reading these settings, which its refusals name:
   * `CreateUserPool` or `UpdateUserPool`.
   */
  readonly operation: string;
}

/**
 * The settings of one simulated user pool that a request can change: the
 * password policy, the deletion protection, whether users may sign themselves
 * up, what confirming a sign-up verifies, the Lambda triggers the pool runs
 * and what its messages say.
 *
 * The pool's id, ARN and name are not among them. The first two identify the
 * pool, and renaming one is not simulated.
 *
 * A setting the request leaves out takes the default real Cognito applies to
 * a pool that never asked for it. That is what makes `UpdateUserPool` replace
 * rather than merge: an update builds a whole configuration out of its own
 * request, and the pool swaps to it, so a setting the update is silent about
 * goes back to its default rather than staying as it was.
 */
export class SimCognitoUserPoolSettings {
  public readonly passwordPolicy: SimCognitoPasswordPolicy;
  public readonly deletionProtection: SimCognitoDeletionProtection;
  public readonly adminCreateUserConfig: SimCognitoAdminCreateUserConfig;
  public readonly autoVerifiedAttributes: SimCognitoAutoVerifiedAttributes;

  /**
   * The Lambda triggers the pool runs, by the ARN of the function each names.
   */
  public readonly lambdaConfig: SimCognitoLambdaConfig;

  /**
   * What the pool says in the message it sends a user signing itself up.
   */
  public readonly verificationMessages: SimCognitoVerificationMessages;

  /**
   * What the request set that nothing here acts on, kept so a described pool
   * reports it.
   */
  public readonly unsimulated: SimCognitoUnsimulatedPoolSettings;

  constructor(properties: SimCognitoUserPoolSettingsProperties) {
    const { input, operation } = properties;

    this.passwordPolicy = new SimCognitoPasswordPolicy(
      input.Policies?.PasswordPolicy,
    );
    this.deletionProtection = new SimCognitoDeletionProtection(
      input.DeletionProtection,
    );
    this.adminCreateUserConfig = new SimCognitoAdminCreateUserConfig(
      input.AdminCreateUserConfig,
    );
    this.autoVerifiedAttributes = new SimCognitoAutoVerifiedAttributes(
      input.AutoVerifiedAttributes,
    );
    this.lambdaConfig = new SimCognitoLambdaConfig(
      input.LambdaConfig,
      operation,
    );
    this.verificationMessages = new SimCognitoVerificationMessages(input);
    this.unsimulated = new SimCognitoUnsimulatedPoolSettings(input);
  }
}

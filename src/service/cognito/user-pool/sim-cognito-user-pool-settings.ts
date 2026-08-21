import {
  SimCognitoAccountRecovery,
  type SimCognitoAccountRecoverySettingType,
} from "./sim-cognito-account-recovery.js";
import {
  SimCognitoAdminCreateUserConfig,
  type SimCognitoAdminCreateUserConfigType,
} from "./sim-cognito-admin-create-user-config.js";
import { SimCognitoAutoVerifiedAttributes } from "./sim-cognito-auto-verified-attributes.js";
import { SimCognitoDeletionProtection } from "./sim-cognito-deletion-protection.js";
import { SimCognitoMfaConfiguration } from "./mfa/sim-cognito-mfa-configuration.js";
import { SimCognitoUserPoolMfa } from "./mfa/sim-cognito-user-pool-mfa.js";
import {
  SimCognitoPasswordPolicy,
  type SimCognitoUserPoolPoliciesType,
} from "./sim-cognito-password-policy.js";
import {
  SimCognitoVerificationMessages,
  type SimCognitoVerificationMessagesType,
} from "./message/sim-cognito-verification-messages.js";
import type { SimCognitoSchemaAttributeType } from "./schema/sim-cognito-schema-attribute.js";
import { SimCognitoUserPoolSchema } from "./schema/sim-cognito-user-pool-schema.js";
import { SimCognitoSignInPolicy } from "./sim-cognito-sign-in-policy.js";
import { SimCognitoUsernameAttributes } from "./sim-cognito-username-attributes.js";
import { SimCognitoLambdaConfig } from "./trigger/sim-cognito-lambda-config.js";

/**
 * The pool settings a request can set, in the shape the SDK sends them.
 *
 * `CreateUserPool` and `UpdateUserPool` both carry these, which is what lets
 * an update build a pool's settings the same way a creation does.
 */
export interface SimCognitoUserPoolSettingsInput extends SimCognitoVerificationMessagesType {
  readonly AccountRecoverySetting?:
    | SimCognitoAccountRecoverySettingType
    | undefined;
  readonly Policies?: SimCognitoUserPoolPoliciesType | undefined;
  readonly DeletionProtection?: string | undefined;
  readonly MfaConfiguration?: string | undefined;
  readonly AdminCreateUserConfig?:
    | SimCognitoAdminCreateUserConfigType
    | undefined;
  readonly AutoVerifiedAttributes?: readonly string[] | undefined;
  readonly LambdaConfig?: object | undefined;

  /**
   * The attributes the pool holds on its users beyond the standard ones.
   *
   * Only `CreateUserPool` carries it. It is named among the shared settings
   * because that is where the pool's schema is built, and `UpdateUserPool`
   * refuses one rather than replacing the schema of a pool that already has
   * users written against it.
   */
  readonly Schema?: readonly SimCognitoSchemaAttributeType[] | undefined;

  /**
   * The attributes the pool signs its users in by, rather than by username.
   *
   * Only `CreateUserPool` carries it, for the same reason `Schema` is here:
   * it is the pool's settings that hold it, and `UpdateUserPool` refuses one
   * rather than changing how a pool with users already in it identifies them.
   */
  readonly UsernameAttributes?: readonly string[] | undefined;
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
 * password policy, the factors it allows at the first prompt, the deletion
 * protection, whether users may sign themselves
 * up, what confirming a sign-up verifies, the Lambda triggers the pool runs,
 * whether it asks for a second factor, how it recovers an account and what its
 * messages say.
 *
 * The pool's id, ARN and name are not among them. The first two identify the
 * pool, and renaming one is not simulated.
 *
 * A setting the request leaves out takes the default real Cognito applies to
 * a pool that never asked for it. That is what makes `UpdateUserPool` replace
 * rather than merge: an update builds a whole configuration out of its own
 * request, and the pool swaps to it, so a setting the update is silent about
 * goes back to its default rather than staying as it was.
 *
 * The schema and the attributes the pool signs users in by are the
 * exceptions. Only `CreateUserPool` declares either, so an update takes both
 * on from the settings it replaces rather than dropping the pool back to the
 * standard attributes and to signing in by username.
 */
export class SimCognitoUserPoolSettings {
  public readonly passwordPolicy: SimCognitoPasswordPolicy;

  /**
   * The factors the pool allows at the first authentication prompt.
   *
   * A pool created without a `SignInPolicy` allows a password and reports no
   * policy, as real Cognito reports one. A `USER_AUTH` sign-in offers the
   * factors this names, narrowed to the ones the user could present.
   */
  public readonly signInPolicy: SimCognitoSignInPolicy;

  public readonly deletionProtection: SimCognitoDeletionProtection;
  public readonly adminCreateUserConfig: SimCognitoAdminCreateUserConfig;
  public readonly autoVerifiedAttributes: SimCognitoAutoVerifiedAttributes;

  /**
   * The Lambda triggers the pool runs, by the ARN of the function each names.
   */
  public readonly lambdaConfig: SimCognitoLambdaConfig;

  /**
   * Whether the pool challenges for a second factor, and which factors it
   * offers.
   *
   * The `MfaConfiguration` is one of these settings because both pool requests
   * carry it. The factors behind it are not: only `SetUserPoolMfaConfig` says
   * what they are, and it changes them in place rather than through a whole
   * new set of settings, so an update carries them across rather than
   * replacing them.
   */
  public readonly mfa: SimCognitoUserPoolMfa;

  /**
   * What the pool says in the message it sends a user signing itself up.
   */
  public readonly verificationMessages: SimCognitoVerificationMessages;

  /**
   * How the pool recovers an account whose password was forgotten, kept so a
   * described pool reports it. Nothing here starts a recovery.
   */
  public readonly accountRecovery: SimCognitoAccountRecovery;

  #schema: SimCognitoUserPoolSchema;
  #usernameAttributes: SimCognitoUsernameAttributes;

  constructor(properties: SimCognitoUserPoolSettingsProperties) {
    const { input, operation } = properties;

    this.passwordPolicy = new SimCognitoPasswordPolicy(
      input.Policies?.PasswordPolicy,
    );
    this.signInPolicy = new SimCognitoSignInPolicy(
      input.Policies?.SignInPolicy,
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
    this.mfa = new SimCognitoUserPoolMfa(
      new SimCognitoMfaConfiguration(input.MfaConfiguration),
    );
    this.verificationMessages = new SimCognitoVerificationMessages(input);
    this.accountRecovery = new SimCognitoAccountRecovery(
      input.AccountRecoverySetting,
      operation,
    );
    this.#schema = new SimCognitoUserPoolSchema(input.Schema);
    this.#usernameAttributes = new SimCognitoUsernameAttributes(
      input.UsernameAttributes,
    );
  }

  /**
   * The attributes the pool holds on its users: the standard ones, and the
   * ones its `Schema` declared under `custom:` names.
   */
  get schema(): SimCognitoUserPoolSchema {
    return this.#schema;
  }

  /**
   * The attributes the pool signs its users in by, from its
   * `UsernameAttributes`. A pool created without any signs users in by
   * username.
   */
  get usernameAttributes(): SimCognitoUsernameAttributes {
    return this.#usernameAttributes;
  }

  /**
   * Take on the settings only a creation declares from the ones this set
   * replaces: the pool's schema, and what it signs its users in by.
   *
   * Real `UpdateUserPool` has neither input, so an update changes nothing
   * about the attributes a pool holds or how it identifies its users.
   * Carrying them across is what keeps that true here, where an update
   * otherwise replaces every setting with the default of the one it left out.
   */
  keepCreationSettingsOf(replaced: SimCognitoUserPoolSettings): void {
    this.#schema = replaced.schema;
    this.#usernameAttributes = replaced.usernameAttributes;
  }
}

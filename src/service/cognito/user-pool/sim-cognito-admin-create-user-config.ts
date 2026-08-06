import { SimCognitoNotAuthorizedException } from "../error/sim-cognito.error.js";

/**
 * The `AdminCreateUserConfig` a request can set on a pool.
 *
 * `InviteMessageTemplate` and `UnusedAccountValidityDays` are named so that
 * `CreateUserPool` can refuse them: both are about the invitation an
 * admin-created user is sent, and nothing here delivers a message.
 */
export interface SimCognitoAdminCreateUserConfigType {
  readonly AllowAdminCreateUserOnly?: boolean | undefined;
  readonly InviteMessageTemplate?: object | undefined;
  readonly UnusedAccountValidityDays?: number | undefined;
}

/**
 * Whether a pool lets users sign themselves up.
 *
 * `AllowAdminCreateUserOnly: true` says only an administrator creates users,
 * and real Cognito refuses `SignUp` against such a pool. That refusal is
 * simulated rather than the setting being accepted and ignored, because a CDK
 * `UserPool` without `selfSignUpEnabled` emits exactly that value: a project
 * testing its registration flow against a pool created that way would pass
 * here and fail in a deployment.
 *
 * A pool created without the setting allows sign-up, which is the AWS default
 * for the field.
 */
export class SimCognitoAdminCreateUserConfig {
  public readonly allowAdminCreateUserOnly: boolean;

  constructor(requested?: SimCognitoAdminCreateUserConfigType) {
    this.allowAdminCreateUserOnly =
      requested?.AllowAdminCreateUserOnly ?? false;
  }

  /**
   * Refuse a sign-up against a pool only an administrator may create users in.
   */
  requireSelfServiceSignUp(): void {
    if (this.allowAdminCreateUserOnly) {
      throw new SimCognitoNotAuthorizedException(
        "SignUp is not permitted for this user pool: it was created with " +
          "AdminCreateUserConfig AllowAdminCreateUserOnly true, so only " +
          "AdminCreateUser makes a user in it.",
      );
    }
  }

  /**
   * This configuration as a described pool reports it.
   *
   * Real Cognito reports the setting whether or not the request named it, so
   * a pool that allows sign-up says so rather than saying nothing.
   */
  toOutput(): SimCognitoAdminCreateUserConfigType {
    return { AllowAdminCreateUserOnly: this.allowAdminCreateUserOnly };
  }
}

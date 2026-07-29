import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";

/**
 * A user pool password policy, in the shape Cognito reports it.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_PasswordPolicyType.html
 */
export interface SimCognitoPasswordPolicyType {
  readonly MinimumLength?: number | undefined;
  readonly RequireUppercase?: boolean | undefined;
  readonly RequireLowercase?: boolean | undefined;
  readonly RequireNumbers?: boolean | undefined;
  readonly RequireSymbols?: boolean | undefined;
  readonly PasswordHistorySize?: number | undefined;
  readonly TemporaryPasswordValidityDays?: number | undefined;
}

/**
 * The sign-in policy of a user pool, which chooses the first factor a user
 * may authenticate with.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SignInPolicyType.html
 */
export interface SimCognitoSignInPolicyType {
  readonly AllowedFirstAuthFactors?: readonly string[] | undefined;
}

/**
 * The policies of a user pool, as Cognito groups them.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UserPoolPolicyType.html
 */
export interface SimCognitoUserPoolPoliciesType {
  readonly PasswordPolicy?: SimCognitoPasswordPolicyType | undefined;
  readonly SignInPolicy?: SimCognitoSignInPolicyType | undefined;
}

const minimumLengthRange = { least: 6, most: 99 };
const temporaryPasswordValidityDaysRange = { least: 0, most: 365 };

/**
 * The password policy of one simulated user pool.
 *
 * The defaults are the ones real Cognito applies when a `CreateUserPool`
 * request says nothing about passwords: eight characters, with an uppercase
 * letter, a lowercase letter, a number and a symbol each required. A pool
 * created here therefore rejects the same passwords a pool created with the
 * SDK and no arguments would.
 */
export class SimCognitoPasswordPolicy {
  public readonly minimumLength: number;
  public readonly requiresUppercase: boolean;
  public readonly requiresLowercase: boolean;
  public readonly requiresNumbers: boolean;
  public readonly requiresSymbols: boolean;
  public readonly temporaryPasswordValidityDays: number;

  constructor(policy: SimCognitoPasswordPolicyType = {}) {
    this.minimumLength = SimCognitoPasswordPolicy.wholeNumberIn(
      "MinimumLength",
      policy.MinimumLength ?? 8,
      minimumLengthRange,
    );
    this.requiresUppercase = policy.RequireUppercase ?? true;
    this.requiresLowercase = policy.RequireLowercase ?? true;
    this.requiresNumbers = policy.RequireNumbers ?? true;
    this.requiresSymbols = policy.RequireSymbols ?? true;
    this.temporaryPasswordValidityDays = SimCognitoPasswordPolicy.wholeNumberIn(
      "TemporaryPasswordValidityDays",
      policy.TemporaryPasswordValidityDays ?? 7,
      temporaryPasswordValidityDaysRange,
    );
  }

  private static wholeNumberIn(
    field: string,
    value: number,
    range: { readonly least: number; readonly most: number },
  ): number {
    if (
      !Number.isSafeInteger(value) ||
      value < range.least ||
      value > range.most
    ) {
      throw new SimCognitoInvalidParameterException(
        `PasswordPolicy ${field} must be a whole number between ` +
          `${String(range.least)} and ${String(range.most)}`,
      );
    }

    return value;
  }

  /**
   * The policy as Cognito reports it on the pool.
   */
  toOutput(): SimCognitoPasswordPolicyType {
    return {
      MinimumLength: this.minimumLength,
      RequireUppercase: this.requiresUppercase,
      RequireLowercase: this.requiresLowercase,
      RequireNumbers: this.requiresNumbers,
      RequireSymbols: this.requiresSymbols,
      TemporaryPasswordValidityDays: this.temporaryPasswordValidityDays,
    };
  }
}

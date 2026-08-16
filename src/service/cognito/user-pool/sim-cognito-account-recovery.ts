import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";

/**
 * One way a pool offers to recover a forgotten password, and where it comes in
 * the order they are offered.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_RecoveryOptionType.html
 */
export interface SimCognitoRecoveryOptionType {
  readonly Name?: string | undefined;
  readonly Priority?: number | undefined;
}

/**
 * The `AccountRecoverySetting` a pool can be created or updated with.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AccountRecoverySettingType.html
 */
export interface SimCognitoAccountRecoverySettingType {
  readonly RecoveryMechanisms?:
    | readonly SimCognitoRecoveryOptionType[]
    | undefined;
}

/**
 * The mechanisms Cognito recovers an account through.
 *
 * `admin_only` is the one that recovers nothing by itself: it says a user
 * cannot start a recovery at all, and an administrator resets the password
 * instead. CDK writes it for `AccountRecovery.NONE`.
 */
const recoveryMechanismNames: readonly string[] = [
  "verified_email",
  "verified_phone_number",
  "admin_only",
];

/**
 * How a pool recovers an account whose password was forgotten.
 *
 * A pool records the mechanisms it was asked for and `DescribeUserPool`
 * reports them back, which is how a test sees that a template's declaration
 * reached the pool rather than being dropped on the way. Email-only recovery
 * is the setting that goes with a pool that sends no SMS, and it is written as
 * `AccountRecovery.EMAIL_ONLY` by CDK.
 *
 * Nothing reads the mechanisms back out. There is no `ForgotPassword` here, so
 * no recovery is ever started and no mechanism is ever chosen. The refusal
 * belongs at the command that would have to choose one, where it can say what
 * was being attempted, rather than at the pool that named them.
 *
 * A mechanism Cognito does not have is refused, because a pool created with
 * one would exist here and fail to be created on real AWS. The priorities are
 * not checked: real Cognito holds them to a range and to being distinct, and a
 * pool that lists them differently behaves the same way here either way.
 */
export class SimCognitoAccountRecovery {
  private readonly operation: string;
  private readonly requested: SimCognitoAccountRecoverySettingType | undefined;

  /**
   * The setting the request carried, and the operation a refusal names, which
   * is `CreateUserPool` or `UpdateUserPool`.
   */
  constructor(
    requested: SimCognitoAccountRecoverySettingType | undefined,
    operation: string,
  ) {
    this.operation = operation;
    this.requested = this.accepted(requested);
  }

  /**
   * This setting as a described pool reports it, or nothing where the request
   * named none.
   *
   * A pool created without one describes without it, rather than describing
   * the mechanisms real Cognito would have given it. Nothing here recovers an
   * account, so reporting a default would say the pool had chosen something it
   * never chose.
   */
  toOutput(): SimCognitoAccountRecoverySettingType | undefined {
    if (this.requested === undefined) {
      return undefined;
    }

    return structuredClone(this.requested);
  }

  /**
   * The setting copied out of the request rather than kept by reference, once
   * every mechanism it names is one Cognito has.
   *
   * The copy goes all the way down, so a described pool reports what the
   * request said at the time it was made even where the caller edits the
   * object afterwards to create a second pool from it.
   */
  private accepted(
    requested: SimCognitoAccountRecoverySettingType | undefined,
  ): SimCognitoAccountRecoverySettingType | undefined {
    if (requested === undefined) {
      return undefined;
    }

    const mechanisms = requested.RecoveryMechanisms ?? [];

    for (const mechanism of mechanisms) {
      this.requireRecognised(mechanism);
    }

    return structuredClone(requested);
  }

  /**
   * Refuse a mechanism real Cognito would refuse.
   */
  private requireRecognised(mechanism: SimCognitoRecoveryOptionType): void {
    if (mechanism.Name === undefined) {
      throw new SimCognitoInvalidParameterException(
        `${this.operation} AccountRecoverySetting has a RecoveryMechanisms ` +
          `entry with no Name`,
      );
    }

    if (!recoveryMechanismNames.includes(mechanism.Name)) {
      throw new SimCognitoInvalidParameterException(
        `${this.operation} AccountRecoverySetting RecoveryMechanisms ` +
          `'${mechanism.Name}' is not a Cognito account recovery mechanism: ` +
          `use ${recoveryMechanismNames.join(", ")}`,
      );
    }
  }
}

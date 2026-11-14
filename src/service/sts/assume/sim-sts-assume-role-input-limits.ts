import { SimIamValidationError } from "../../iam/error/sim-iam.error.js";

/**
 * The session STS issues when the request names no duration, in seconds.
 */
const defaultDurationSeconds = 3600;

/**
 * The shortest session STS issues, in seconds.
 */
const minimumDurationSeconds = 900;

/**
 * The longest session any Role can allow, in seconds.
 */
const maximumDurationSeconds = 43_200;

/**
 * The most managed session policies one request can pass.
 */
const maximumPolicyArns = 10;

/**
 * A request member's length and pattern constraints.
 */
interface SimStsTextConstraint {
  readonly member: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly pattern: RegExp;
  readonly patternText: string;
}

const roleSessionName: SimStsTextConstraint = {
  member: "roleSessionName",
  minimum: 2,
  maximum: 64,
  pattern: /^[\w+=,.@-]*$/u,
  patternText: String.raw`[\w+=,.@-]*`,
};

const externalId: SimStsTextConstraint = {
  member: "externalId",
  minimum: 2,
  maximum: 1224,
  pattern: /^[\w+=,.@:/-]*$/u,
  patternText: String.raw`[\w+=,.@:\/-]*`,
};

/**
 * Checks the AssumeRole members that STS validates before it looks at any
 * Role, with the error STS answers each one with.
 */
export class SimStsAssumeRoleInputLimits {
  /**
   * Refuse a session name STS would refuse.
   */
  roleSessionName(value: string): void {
    this.text(roleSessionName, value);
  }

  /**
   * Refuse an external ID STS would refuse, where one is given.
   */
  externalId(value: string | undefined): void {
    if (value !== undefined) {
      this.text(externalId, value);
    }
  }

  /**
   * The session duration a request asks for, with the STS default applied,
   * refusing one outside what any Role can allow.
   *
   * Session duration is represented in whole seconds. Fractional values, NaN,
   * and infinities are rejected because they cannot describe a credential
   * lifetime.
   */
  durationSeconds(requested: number | undefined): number {
    const value = requested ?? defaultDurationSeconds;

    /* v8 ignore if */
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("DurationSeconds must be an integer");
    }

    if (value < minimumDurationSeconds) {
      throw SimIamValidationError.member(
        "durationSeconds",
        value,
        `have value greater than or equal to ${String(minimumDurationSeconds)}`,
      );
    }

    if (value > maximumDurationSeconds) {
      throw SimIamValidationError.member(
        "durationSeconds",
        value,
        `have value less than or equal to ${String(maximumDurationSeconds)}`,
      );
    }

    return value;
  }

  /**
   * Refuse more managed session policies than STS accepts.
   */
  policyArns(arns: readonly string[]): void {
    if (arns.length > maximumPolicyArns) {
      throw SimIamValidationError.member(
        "policyArns",
        `[${arns.join(", ")}]`,
        `have length less than or equal to ${String(maximumPolicyArns)}`,
      );
    }
  }

  private text(constraint: SimStsTextConstraint, value: string): void {
    const fail = (rule: string): SimIamValidationError =>
      SimIamValidationError.member(constraint.member, value, rule);

    if (value.length < constraint.minimum) {
      throw fail(
        `have length greater than or equal to ${String(constraint.minimum)}`,
      );
    }

    if (value.length > constraint.maximum) {
      throw fail(
        `have length less than or equal to ${String(constraint.maximum)}`,
      );
    }

    if (!constraint.pattern.test(value)) {
      throw fail(
        `satisfy regular expression pattern: ${constraint.patternText}`,
      );
    }
  }
}

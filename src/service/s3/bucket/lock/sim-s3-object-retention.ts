import { SimS3InvalidRequest } from "../../error/sim-s3.error.js";

/**
 * The two modes a retention period can be in.
 *
 * Governance is the one an account can get out of, by naming
 * `BypassGovernanceRetention` while holding `s3:BypassGovernanceRetention`.
 * Compliance is the one nobody can, including the account root, which is what
 * makes it worth having.
 */
export const simS3GovernanceMode = "GOVERNANCE";
export const simS3ComplianceMode = "COMPLIANCE";

const retentionModes: ReadonlySet<string> = new Set([
  simS3GovernanceMode,
  simS3ComplianceMode,
]);

/** The two modes, as a refusal names them. */
export const simS3RetentionModeNames = `${simS3GovernanceMode} or ${simS3ComplianceMode}`;

/**
 * Structural shape of an S3 ObjectLockRetention.
 *
 * Matches the AWS SDK and CloudFormation property shape, so the same object
 * can come from either.
 */
export interface SimS3RetentionInput {
  readonly Mode?: string | undefined;
  readonly RetainUntilDate?: Date | string | undefined;
}

interface SimS3ObjectRetentionProperties {
  readonly mode: string;
  readonly retainUntil: Date;
}

/**
 * How long one version of one Object cannot be deleted for.
 *
 * A retention is a mode and an instant, and the instant is compared against
 * simulated time on every delete. Nothing schedules its expiry: the period
 * lapses because the clock moved past it, which is how a test watches a
 * retained version become deletable.
 */
export class SimS3ObjectRetention {
  public readonly mode: string;

  private readonly retainUntil: Date;

  constructor(properties: SimS3ObjectRetentionProperties) {
    this.mode = properties.mode;
    this.retainUntil = new Date(properties.retainUntil);
  }

  /**
   * Read a retention a request is setting, refusing one real S3 refuses.
   */
  static parse(input: SimS3RetentionInput): SimS3ObjectRetention {
    const mode = input.Mode;

    if (mode === undefined || !retentionModes.has(mode)) {
      throw new SimS3InvalidRequest(
        `Object Lock retention Mode has to be ${simS3RetentionModeNames}`,
      );
    }

    return new SimS3ObjectRetention({
      mode,
      retainUntil: retainUntilDate(input.RetainUntilDate),
    });
  }

  /** When the period lapses. A copy, because a Date is mutable. */
  get retainUntilDate(): Date {
    return new Date(this.retainUntil);
  }

  /** Whether this retention still holds at an instant of simulated time. */
  isActiveAt(instant: Date): boolean {
    return instant.getTime() < this.retainUntil.getTime();
  }

  /** Whether this retention runs at least as long as another. */
  isAtLeast(other: SimS3ObjectRetention): boolean {
    return this.retainUntil.getTime() >= other.retainUntil.getTime();
  }

  /** What GetObject and HeadObject report about the version. */
  get reported(): { ObjectLockMode: string; ObjectLockRetainUntilDate: Date } {
    return {
      ObjectLockMode: this.mode,
      ObjectLockRetainUntilDate: this.retainUntilDate,
    };
  }
}

/**
 * Read the instant a retention runs until.
 *
 * The SDK sends a Date and CloudFormation sends the string it was written as,
 * so both are read. A value that is not a date at all leaves a version looking
 * retained until an unknowable instant, so it is refused instead.
 */
function retainUntilDate(value: Date | string | undefined): Date {
  if (value === undefined) {
    throw new SimS3InvalidRequest(
      "Object Lock retention requires a RetainUntilDate",
    );
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new SimS3InvalidRequest(
      `Object Lock retention RetainUntilDate ${String(value)} is not a date`,
    );
  }

  return parsed;
}

import { SimS3InvalidRequest } from "../../error/sim-s3.error.js";
import { SimS3ObjectRetention } from "./sim-s3-object-retention.js";
import { simS3RetentionMode } from "./sim-s3-default-retention.js";

const millisecondsPerDay = 86_400_000;

/** The one value `ObjectLockEnabled` takes. Real S3 has no way to turn it off. */
export const simS3ObjectLockEnabled = "Enabled";

/**
 * Structural shape of an S3 ObjectLockConfiguration.
 *
 * Matches the AWS SDK and CloudFormation property shape, so the same object
 * can come from either.
 */
export interface SimS3ObjectLockConfigurationInput {
  readonly ObjectLockEnabled?: string | undefined;
  readonly Rule?:
    | {
        readonly DefaultRetention?:
          | {
              readonly Mode?: string | undefined;
              readonly Days?: number | undefined;
              readonly Years?: number | undefined;
            }
          | undefined;
      }
    | undefined;
}

interface SimS3ObjectLockConfigurationProperties {
  readonly mode: string;
  readonly days: number;
}

/**
 * How one simulated S3 Bucket is locked, and for how long by default.
 *
 * A Bucket either has Object Lock turned on or has never had it. Real S3 has
 * no request that turns it off again, which is what lets a reader's history be
 * promised rather than merely configured.
 *
 * The default retention is optional. A Bucket with Object Lock on and no
 * default locks nothing on its own, and every version it holds is retained
 * only by the requests that name it. A Bucket with one retains every version
 * written after it, counted from the write.
 */
export class SimS3ObjectLockConfiguration {
  private readonly defaults: SimS3ObjectLockConfigurationProperties | undefined;

  private constructor(defaults?: SimS3ObjectLockConfigurationProperties) {
    this.defaults = defaults;
  }

  /**
   * Read a configuration a request is setting, refusing one real S3 refuses.
   */
  static parse(
    input: SimS3ObjectLockConfigurationInput,
  ): SimS3ObjectLockConfiguration {
    if (input.ObjectLockEnabled !== simS3ObjectLockEnabled) {
      throw new SimS3InvalidRequest(
        `ObjectLockEnabled has to be ${simS3ObjectLockEnabled}`,
      );
    }

    const declared = input.Rule?.DefaultRetention;

    if (declared === undefined) {
      return new SimS3ObjectLockConfiguration();
    }

    return new SimS3ObjectLockConfiguration({
      mode: simS3RetentionMode(declared.Mode),
      days: simS3DefaultRetentionDays(declared),
    });
  }

  /**
   * The retention a version written at an instant is given.
   *
   * Real S3 counts a default retention from the write rather than from the
   * configuration, so two versions of one key written a day apart are retained
   * until two different instants.
   */
  retentionAt(instant: Date): SimS3ObjectRetention | undefined {
    const defaults = this.defaults;

    if (defaults === undefined) {
      return undefined;
    }

    return new SimS3ObjectRetention({
      mode: defaults.mode,
      retainUntil: new Date(
        instant.getTime() + defaults.days * millisecondsPerDay,
      ),
    });
  }

  /** What GetObjectLockConfiguration answers with. */
  get reported(): SimS3ObjectLockConfigurationInput {
    const defaults = this.defaults;

    return {
      ObjectLockEnabled: simS3ObjectLockEnabled,
      ...(defaults !== undefined && {
        Rule: {
          DefaultRetention: { Mode: defaults.mode, Days: defaults.days },
        },
      }),
    };
  }
}

/**
 * The length of a default retention, in days.
 *
 * Real S3 takes it as either `Days` or `Years` and refuses both together. A
 * year is 365 days here, which is what S3 documents its own arithmetic as.
 */
function simS3DefaultRetentionDays(declared: {
  readonly Days?: number | undefined;
  readonly Years?: number | undefined;
}): number {
  const { Days, Years } = declared;

  if ((Days === undefined) === (Years === undefined)) {
    throw new SimS3InvalidRequest(
      "Object Lock DefaultRetention requires either Days or Years, and " +
        "refuses both together",
    );
  }

  const period = Days ?? Years;

  if (period === undefined || period < 1 || !Number.isSafeInteger(period)) {
    throw new SimS3InvalidRequest(
      `Object Lock DefaultRetention period ${String(period)} has to be a ` +
        `whole number of at least 1`,
    );
  }

  return Days === undefined ? period * 365 : period;
}

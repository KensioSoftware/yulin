import {
  simS3DefaultServerSideEncryption,
  simS3ServerSideEncryptionFrom,
  type SimS3ServerSideEncryption,
} from "../../object/s3-server-side-encryption.js";

/**
 * The encryption a Bucket applies to an Object whose write named none.
 */
export interface SimS3ServerSideEncryptionByDefault {
  readonly SSEAlgorithm?: string | undefined;
  readonly KMSMasterKeyID?: string | undefined;
}

/**
 * One rule of a Bucket's default encryption configuration.
 *
 * Real S3 takes exactly one. `BucketKeyEnabled` says whether S3 uses a bucket
 * key to cut KMS calls, and is stored and read back here without acting.
 */
export interface SimS3ServerSideEncryptionRule {
  readonly ApplyServerSideEncryptionByDefault?:
    | SimS3ServerSideEncryptionByDefault
    | undefined;
  readonly BucketKeyEnabled?: boolean | undefined;
}

/**
 * A Bucket's default encryption configuration, as a request states it.
 */
export interface SimS3ServerSideEncryptionConfiguration {
  readonly Rules?: readonly SimS3ServerSideEncryptionRule[] | undefined;
}

interface SimS3BucketEncryptionProperties {
  readonly rules?: readonly SimS3ServerSideEncryptionRule[] | undefined;
}

/**
 * The default encryption of one simulated S3 Bucket.
 *
 * Nothing is encrypted. The bytes of an Object are stored as they arrive, and
 * its ETag stays the MD5 of them, which is what real S3 reports for an
 * SSE-S3 Object as well. What this decides is the algorithm a write stamps on
 * an Object when it names none itself, and what `GetBucketEncryption` answers.
 *
 * A Bucket nobody has configured is SSE-S3 encrypted. Real S3 has applied that
 * default to every Bucket since January 2023, and answers a read of an
 * unconfigured Bucket with the same `AES256` rule as one configured that way.
 */
export class SimS3BucketEncryption {
  private readonly storedRules: readonly SimS3ServerSideEncryptionRule[];

  constructor(properties: SimS3BucketEncryptionProperties = {}) {
    this.storedRules = structuredClone(properties.rules ?? defaultRules);
  }

  /**
   * The encryption a Bucket nobody has configured has, which is what
   * `DeleteBucketEncryption` puts a Bucket back to.
   */
  static default(): SimS3BucketEncryption {
    return new SimS3BucketEncryption();
  }

  /**
   * The encryption a PutBucketEncryption request asks for.
   *
   * Every algorithm named is read here, before the Bucket is changed, so a
   * configuration real S3 refuses leaves the Bucket as it was.
   */
  static fromConfiguration(
    configuration: SimS3ServerSideEncryptionConfiguration,
    bucketName: string,
  ): SimS3BucketEncryption {
    const rules = configuration.Rules ?? [];

    for (const rule of rules) {
      simS3ServerSideEncryptionFrom(
        rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm,
        `the default encryption of Bucket ${bucketName}`,
      );
    }

    return new SimS3BucketEncryption({ rules });
  }

  /**
   * The algorithm this Bucket stamps on an Object written without one.
   */
  get algorithm(): SimS3ServerSideEncryption {
    const named = this.storedRules
      .map((rule) => rule.ApplyServerSideEncryptionByDefault?.SSEAlgorithm)
      .find((algorithm) => algorithm !== undefined);

    return (
      simS3ServerSideEncryptionFrom(named, "a stored Bucket configuration") ??
      simS3DefaultServerSideEncryption
    );
  }

  /**
   * The configuration a read of the Bucket answers with.
   *
   * Cloned on the way out, so a caller holding what it was given cannot change
   * what the Bucket applies by mutating it.
   */
  get configuration(): SimS3ServerSideEncryptionConfiguration {
    return { Rules: structuredClone(this.storedRules) };
  }
}

/**
 * The rule real S3 reports for a Bucket nobody has configured.
 */
const defaultRules: readonly SimS3ServerSideEncryptionRule[] = [
  {
    ApplyServerSideEncryptionByDefault: {
      SSEAlgorithm: simS3DefaultServerSideEncryption,
    },
    BucketKeyEnabled: false,
  },
];

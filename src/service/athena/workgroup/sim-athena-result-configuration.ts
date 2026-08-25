import type { SimAthenaResultConfigurationUpdates } from "./sim-athena-work-group-updates.js";

/**
 * How a query's results are encrypted where the workgroup asks for it.
 */
export interface SimAthenaResultEncryption {
  readonly encryptionOption?: string | undefined;
  readonly kmsKey?: string | undefined;
}

/**
 * The ACL a query's result object is written with.
 */
export interface SimAthenaResultAcl {
  readonly s3AclOption?: string | undefined;
}

interface SimAthenaResultConfigurationProperties {
  readonly outputLocation?: string | undefined;
  readonly encryption?: SimAthenaResultEncryption | undefined;
  readonly acl?: SimAthenaResultAcl | undefined;
  readonly expectedBucketOwner?: string | undefined;
}

/**
 * Where a workgroup's query results go, and how they are written.
 *
 * Only the output location is acted on, and acting on it here means reporting
 * it. The encryption, the ACL and the expected bucket owner are held and handed
 * back so a caller reading a workgroup sees what it was created with. The docs
 * page lists them under Limitations.
 */
export class SimAthenaResultConfiguration {
  public readonly outputLocation: string | undefined;
  public readonly encryption: SimAthenaResultEncryption | undefined;
  public readonly acl: SimAthenaResultAcl | undefined;
  public readonly expectedBucketOwner: string | undefined;

  constructor(properties: SimAthenaResultConfigurationProperties = {}) {
    this.outputLocation = properties.outputLocation;
    this.encryption = properties.encryption;
    this.acl = properties.acl;
    this.expectedBucketOwner = properties.expectedBucketOwner;
  }

  /**
   * Whether this configuration says anything at all.
   *
   * A request carrying an empty `ResultConfiguration` leaves the workgroup
   * without one, rather than with an object holding nothing.
   */
  get isEmpty(): boolean {
    return (
      this.outputLocation === undefined &&
      this.encryption === undefined &&
      this.acl === undefined &&
      this.expectedBucketOwner === undefined
    );
  }

  /**
   * Apply a `ResultConfigurationUpdates`, or nothing where it emptied this.
   *
   * A field the update names is taken, a field it removes is cleared, and a
   * field it says nothing about is kept, which is how real Athena merges one.
   */
  updatedWith(
    updates: SimAthenaResultConfigurationUpdates,
  ): SimAthenaResultConfiguration | undefined {
    const updated = new SimAthenaResultConfiguration({
      outputLocation: this.kept(
        updates.outputLocation,
        this.outputLocation,
        updates.removeOutputLocation,
      ),
      encryption: this.kept(
        updates.encryption,
        this.encryption,
        updates.removeEncryptionConfiguration,
      ),
      acl: this.kept(updates.acl, this.acl, updates.removeAclConfiguration),
      expectedBucketOwner: this.kept(
        updates.expectedBucketOwner,
        this.expectedBucketOwner,
        updates.removeExpectedBucketOwner,
      ),
    });

    return updated.isEmpty ? undefined : updated;
  }

  /**
   * What one field is left holding after an update.
   *
   * A removal flag clears the field, whatever else the update said about it.
   * AWS documents each flag as setting its field to null, and real Athena
   * refuses a request that both removes a field and replaces it.
   */
  private kept<TField>(
    updated: TField | undefined,
    current: TField | undefined,
    removed: boolean | undefined,
  ): TField | undefined {
    if (removed === true) {
      return undefined;
    }

    return updated ?? current;
  }
}

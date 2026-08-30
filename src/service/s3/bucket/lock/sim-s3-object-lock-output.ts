/**
 * What a read of an Object says about the Object Lock holding it.
 *
 * `GetObject` and `HeadObject` both report these, and a version nothing is
 * holding leaves all three out rather than reporting them empty.
 */
export interface SimS3ObjectLockOutput {
  /** The mode of the retention period on the version, if it has one. */
  readonly ObjectLockMode?: string;
  /** When that period lapses. */
  readonly ObjectLockRetainUntilDate?: Date;
  /** `ON` while a legal hold is on the version, and absent otherwise. */
  readonly ObjectLockLegalHoldStatus?: string;
}

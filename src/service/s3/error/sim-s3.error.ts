/**
 * Minimal metadata shape for simulated S3 errors.
 */
export interface SimS3ErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated S3 errors.
 */
export class SimS3Error extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimS3ErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated S3 NoSuchBucket error.
 */
export class SimS3NoSuchBucket extends SimS3Error {
  public override readonly name = "NoSuchBucket";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated S3 NoSuchKey error.
 */
export class SimS3NoSuchKey extends SimS3Error {
  public override readonly name = "NoSuchKey";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated S3 BucketAlreadyExists error.
 */
export class SimS3BucketAlreadyExists extends SimS3Error {
  public override readonly name = "BucketAlreadyExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Simulated S3 BucketAlreadyOwnedByYou error.
 */
export class SimS3BucketAlreadyOwnedByYou extends SimS3Error {
  public override readonly name = "BucketAlreadyOwnedByYou";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

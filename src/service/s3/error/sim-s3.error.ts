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
 * Simulated S3 NotFound error.
 *
 * This is what a HEAD answers with, for a Bucket and for an Object alike. A
 * HEAD response carries no body, so there is no error document to read a code
 * out of, and real S3 answers the one status for both rather than the
 * NoSuchBucket and NoSuchKey a GET distinguishes.
 */
export class SimS3NotFound extends SimS3Error {
  public override readonly name = "NotFound";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated S3 NoSuchVersion error.
 *
 * What real S3 answers when a request names a version id that no version of
 * that key was ever given. A key that exists with a version id that does not
 * is this rather than NoSuchKey.
 */
export class SimS3NoSuchVersion extends SimS3Error {
  public override readonly name = "NoSuchVersion";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated S3 MethodNotAllowed error.
 *
 * What real S3 answers to a read of a delete marker by its own version id. The
 * marker exists, so it is not a missing version, and it holds no bytes to
 * send.
 */
export class SimS3MethodNotAllowed extends SimS3Error {
  public override readonly name = "MethodNotAllowed";

  constructor(message: string) {
    super(message, { httpStatusCode: 405 });
  }
}

/**
 * Simulated S3 NoSuchBucketPolicy error.
 *
 * Real S3 distinguishes a Bucket that does not exist from a Bucket that exists
 * without a policy, so GetBucketPolicy answers this rather than an empty policy.
 */
export class SimS3NoSuchBucketPolicy extends SimS3Error {
  public override readonly name = "NoSuchBucketPolicy";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated S3 NoSuchLifecycleConfiguration error.
 *
 * Real S3 distinguishes a Bucket that does not exist from a Bucket that exists
 * without lifecycle rules, so GetBucketLifecycleConfiguration answers this
 * rather than an empty list of rules.
 */
export class SimS3NoSuchLifecycleConfiguration extends SimS3Error {
  public override readonly name = "NoSuchLifecycleConfiguration";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated S3 AccessDenied error.
 *
 * This is S3 itself refusing a request, as Block Public Access does, rather
 * than sim IAM denying it after evaluating policies.
 */
export class SimS3AccessDenied extends SimS3Error {
  public override readonly name = "AccessDenied";

  constructor(message: string) {
    super(message, { httpStatusCode: 403 });
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

/**
 * Simulated S3 BucketNotEmpty error.
 *
 * Real S3 refuses to delete a Bucket that still holds Objects, leaving it to
 * the caller to empty it first.
 */
export class SimS3BucketNotEmpty extends SimS3Error {
  public override readonly name = "BucketNotEmpty";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Simulated S3 MalformedXML error.
 *
 * Real S3 answers this when the request document is not one it accepts, which
 * is how a DeleteObjects request naming no Objects, or more than a thousand of
 * them, is refused.
 */
export class SimS3MalformedXml extends SimS3Error {
  public override readonly name = "MalformedXML";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated S3 InvalidArgument error.
 *
 * Real S3 answers this when a request argument is not one it accepts, which is
 * how a notification configuration with overlapping filters, a repeated
 * configuration id or an unusable destination is refused.
 */
export class SimS3InvalidArgument extends SimS3Error {
  public override readonly name = "InvalidArgument";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated S3 InvalidStorageClass error.
 *
 * Real S3 answers this for a write naming a storage class it has no such class
 * for, and refuses the write rather than storing the Object in the default one.
 */
export class SimS3InvalidStorageClass extends SimS3Error {
  public override readonly name = "InvalidStorageClass";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated S3 NotImplemented error.
 *
 * Something real S3 does that the simulator refuses rather than approximates.
 * Real S3 uses the same code for a request it will not carry out.
 */
export class SimS3NotImplemented extends SimS3Error {
  public override readonly name = "NotImplemented";

  constructor(message: string) {
    super(message, { httpStatusCode: 501 });
  }
}

/**
 * Simulated S3 InvalidBucketName error.
 */
export class SimS3InvalidBucketName extends SimS3Error {
  public override readonly name = "InvalidBucketName";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated S3 InvalidRange error.
 *
 * A read whose `Range` names bytes the Object does not hold, which real S3
 * refuses with `416 Range Not Satisfiable` rather than answering with the
 * bytes it does hold. A client that asked for a range it cannot have has
 * misjudged the Object's size, and reading a different slice than the one it
 * asked for would leave it assembling a file out of the wrong pieces.
 */
export class SimS3InvalidRange extends SimS3Error {
  public override readonly name = "InvalidRange";

  constructor(message: string) {
    super(message, { httpStatusCode: 416 });
  }
}

/**
 * Simulated S3 InvalidRequest error.
 *
 * A request real S3 understands and refuses to carry out. A CopyObject naming
 * the same Object as its source and its destination, with nothing about the
 * Object being changed, is the one sim S3 raises it for.
 */
export class SimS3InvalidRequest extends SimS3Error {
  public override readonly name = "InvalidRequest";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

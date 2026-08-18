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
 * Simulated S3 NoSuchUpload error.
 *
 * What real S3 answers when a request names a multipart upload id it did not
 * issue, or one belonging to an upload that has since been completed or
 * aborted.
 */
export class SimS3NoSuchUpload extends SimS3Error {
  public override readonly name = "NoSuchUpload";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated S3 InvalidPart error.
 *
 * A completion naming a part that was never uploaded, or naming an ETag other
 * than the one that part was stored under. Real S3 refuses rather than
 * assembling what it can, because a caller that lost a part should not end up
 * with an Object silently missing its middle.
 */
export class SimS3InvalidPart extends SimS3Error {
  public override readonly name = "InvalidPart";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated S3 InvalidPartOrder error.
 *
 * A completion listing its parts in an order other than ascending part number.
 * The parts themselves can be uploaded in any order; it is the list in the
 * completion request that real S3 requires to be sorted.
 */
export class SimS3InvalidPartOrder extends SimS3Error {
  public override readonly name = "InvalidPartOrder";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

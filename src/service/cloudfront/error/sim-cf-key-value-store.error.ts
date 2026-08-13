import { SimCloudFrontError } from "./sim-cloudfront.error.js";

/**
 * Simulated CloudFront EntityAlreadyExists error.
 *
 * CloudFront requires a key value store name to be unique within an account,
 * so a second store claiming a name is refused rather than created.
 */
export class SimCloudFrontEntityAlreadyExists extends SimCloudFrontError {
  public override readonly name = "EntityAlreadyExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Simulated CloudFront EntityNotFound error.
 *
 * What CloudFront answers when a key value store name, ID or ARN names
 * nothing the account holds.
 */
export class SimCloudFrontEntityNotFound extends SimCloudFrontError {
  public override readonly name = "EntityNotFound";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated CloudFront CannotDeleteEntityWhileInUse error.
 *
 * CloudFront will not delete a key value store a Function is still associated
 * with. The caller updates the Function to drop the association first.
 */
export class SimCloudFrontCannotDeleteEntityWhileInUse extends SimCloudFrontError {
  public override readonly name = "CannotDeleteEntityWhileInUse";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Simulated CloudFront PreconditionFailed error.
 *
 * What CloudFront answers when a write carries an IfMatch ETag that is not the
 * resource's current one, which is how it stops two writers overwriting each
 * other.
 */
export class SimCloudFrontPreconditionFailed extends SimCloudFrontError {
  public override readonly name = "PreconditionFailed";

  constructor(message: string) {
    super(message, { httpStatusCode: 412 });
  }
}

/**
 * Simulated CloudFront key value store ResourceNotFoundException error.
 *
 * What the key value store data API answers for a key that is not stored. It
 * is the data API's own error rather than one of CloudFront's, which is why it
 * is named in the exception style that API uses.
 */
export class SimCloudFrontKeyValueStoreKeyNotFound extends SimCloudFrontError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated CloudFront Function key value store access error.
 *
 * What a Function gets from `cf.kvs()` when there is no store it may open: it
 * has no association, or it asked for one other than the store it names. Real
 * CloudFront fails the Function at that point too, so this refuses rather than
 * handing back an empty store the Function would read every default from.
 */
export class SimCloudFrontCffKvsUnavailable extends SimCloudFrontError {
  public override readonly name = "CffKeyValueStoreUnavailable";

  constructor(message: string) {
    super(message, { httpStatusCode: 500 });
  }
}

/**
 * Simulated CloudFront InvalidKeyValueStoreAssociation error.
 *
 * What CloudFront answers for a Function association it will not take: more
 * than one store, a store the Account does not hold, or any association at all
 * on the 1.0 runtime, which cannot read one.
 */
export class SimCloudFrontInvalidKeyValueStoreAssociation extends SimCloudFrontError {
  public override readonly name = "InvalidKeyValueStoreAssociation";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated key value store data API ResourceNotFoundException error.
 *
 * What that API answers for a `KvsARN` naming no store. The two clients have
 * separate error sets, so this is not CloudFront's `EntityNotFound` even
 * though both mean the store was not found.
 */
export class SimCloudFrontKeyValueStoreNotFound extends SimCloudFrontError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

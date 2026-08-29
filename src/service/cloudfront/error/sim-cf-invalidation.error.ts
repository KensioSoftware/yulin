import { SimCloudFrontError } from "./sim-cloudfront.error.js";

/**
 * Simulated CloudFront NoSuchInvalidation error.
 *
 * What CloudFront answers when an invalidation ID names nothing on the
 * Distribution it was asked for.
 */
export class SimCloudFrontNoSuchInvalidation extends SimCloudFrontError {
  public override readonly name = "NoSuchInvalidation";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated CloudFront InvalidationBatchAlreadyExists error.
 *
 * A `CallerReference` makes an invalidation batch idempotent. Repeating one
 * with the paths it was created with answers with that invalidation, and
 * repeating it with different paths is refused rather than clearing anything.
 */
export class SimCloudFrontInvalidationBatchAlreadyExists extends SimCloudFrontError {
  public override readonly name = "InvalidationBatchAlreadyExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

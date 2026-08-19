/**
 * Minimal metadata shape for simulated CloudFront errors.
 */
export interface SimCloudFrontErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated CloudFront errors.
 */
export class SimCloudFrontError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimCloudFrontErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated CloudFront InvalidViewerCertificate error.
 *
 * This is what real CloudFront returns for every way a viewer certificate can
 * be unusable, including the common case of an ACM certificate outside
 * us-east-1.
 */
export class SimCloudFrontInvalidViewerCertificate extends SimCloudFrontError {
  public override readonly name = "InvalidViewerCertificate";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudFront InvalidDefaultRootObject error.
 *
 * CloudFront requires the default root object to name an object at the Origin,
 * so a value starting with a forward slash is refused.
 */
export class SimCloudFrontInvalidDefaultRootObject extends SimCloudFrontError {
  public override readonly name = "InvalidDefaultRootObject";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudFront InvalidErrorCode error.
 */
export class SimCloudFrontInvalidErrorCode extends SimCloudFrontError {
  public override readonly name = "InvalidErrorCode";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudFront InvalidResponseCode error.
 */
export class SimCloudFrontInvalidResponseCode extends SimCloudFrontError {
  public override readonly name = "InvalidResponseCode";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudFront InvalidArgument error.
 */
export class SimCloudFrontInvalidArgument extends SimCloudFrontError {
  public override readonly name = "InvalidArgument";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudFront NoSuchDistribution error.
 *
 * What CloudFront answers when a Distribution ID names nothing.
 */
export class SimCloudFrontNoSuchDistribution extends SimCloudFrontError {
  public override readonly name = "NoSuchDistribution";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated CloudFront NoSuchFunctionExists error.
 *
 * What CloudFront answers when a Function name names nothing.
 */
export class SimCloudFrontNoSuchFunctionExists extends SimCloudFrontError {
  public override readonly name = "NoSuchFunctionExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated CloudFront NoSuchResponseHeadersPolicy error.
 *
 * What CloudFront answers when a response headers policy ID names nothing.
 */
export class SimCloudFrontNoSuchResponseHeadersPolicy extends SimCloudFrontError {
  public override readonly name = "NoSuchResponseHeadersPolicy";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated CloudFront InvalidResponseHeadersPolicyId error.
 *
 * What CloudFront answers when a Behavior's `ResponseHeadersPolicyId` names no
 * response headers policy the account holds, at Distribution create or update
 * time rather than when a request first needs the policy.
 */
export class SimCloudFrontInvalidResponseHeadersPolicyId extends SimCloudFrontError {
  public override readonly name = "InvalidResponseHeadersPolicyId";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudFront ResponseHeadersPolicyAlreadyExists error.
 *
 * CloudFront requires a response headers policy name to be unique within an
 * account, so a second policy claiming a name is refused rather than created.
 */
export class SimCloudFrontResponseHeadersPolicyAlreadyExists extends SimCloudFrontError {
  public override readonly name = "ResponseHeadersPolicyAlreadyExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Simulated CloudFront InvalidOriginAccessControl error.
 *
 * What CloudFront answers when an Origin's `OriginAccessControlId` names no
 * origin access control the account holds.
 */
export class SimCloudFrontInvalidOriginAccessControl extends SimCloudFrontError {
  public override readonly name = "InvalidOriginAccessControl";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudFront OriginAccessControlAlreadyExists error.
 *
 * CloudFront requires an origin access control name to be unique within an
 * account, so a second one claiming a name is refused rather than created.
 */
export class SimCloudFrontOriginAccessControlAlreadyExists extends SimCloudFrontError {
  public override readonly name = "OriginAccessControlAlreadyExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Simulated CloudFront InconsistentQuantities error.
 *
 * Every CloudFront list carries a `Quantity` alongside its `Items`, and
 * CloudFront refuses a request where the two disagree.
 */
export class SimCloudFrontInconsistentQuantities extends SimCloudFrontError {
  public override readonly name = "InconsistentQuantities";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudFront DistributionNotDisabled error.
 *
 * CloudFront will not delete a Distribution that is still serving. The caller
 * disables it with UpdateDistribution first.
 */
export class SimCloudFrontDistributionNotDisabled extends SimCloudFrontError {
  public override readonly name = "DistributionNotDisabled";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Simulated CloudFront FunctionSizeLimitExceeded error.
 *
 * CloudFront caps Function source at 10 KB and will not raise the quota. What
 * counts is the source as uploaded, comments and all, because nothing minifies
 * it on the way.
 */
export class SimCloudFrontFunctionSizeLimitExceeded extends SimCloudFrontError {
  public override readonly name = "FunctionSizeLimitExceeded";

  constructor(message: string) {
    super(message, { httpStatusCode: 413 });
  }
}

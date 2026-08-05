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
 * Simulated CloudFront ResourceNotFoundException error.
 */
export class SimCloudFrontResourceNotFoundException extends SimCloudFrontError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

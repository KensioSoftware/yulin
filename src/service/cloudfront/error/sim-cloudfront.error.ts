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
 * Simulated CloudFront ResourceNotFoundException error.
 */
export class SimCloudFrontResourceNotFoundException extends SimCloudFrontError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

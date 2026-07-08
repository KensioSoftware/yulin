/**
 * Minimal metadata shape for simulated IAM errors.
 */
export interface SimIamErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated IAM errors.
 */
export class SimIamError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimIamErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated IAM NoSuchEntity error.
 */
export class SimIamNoSuchEntity extends SimIamError {
  public override readonly name = "NoSuchEntity";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated IAM EntityAlreadyExists error.
 */
export class SimIamEntityAlreadyExists extends SimIamError {
  public override readonly name = "EntityAlreadyExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Simulated IAM InvalidMarker error.
 */
export class SimIamInvalidMarkerException extends SimIamError {
  public override readonly name = "InvalidMarkerException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

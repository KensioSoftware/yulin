/**
 * Minimal metadata shape for simulated ACM errors.
 */
export interface SimAcmErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated ACM errors.
 */
export class SimAcmError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimAcmErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated ACM InvalidArgsException error.
 */
export class SimAcmInvalidArgsException extends SimAcmError {
  public override readonly name = "InvalidArgsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ACM ResourceNotFoundException error.
 */
export class SimAcmResourceNotFoundException extends SimAcmError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ACM TooManyTagsException error.
 */
export class SimAcmTooManyTagsException extends SimAcmError {
  public override readonly name = "TooManyTagsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

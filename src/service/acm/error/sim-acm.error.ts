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
export class SimAcmInvalidArgumentsException extends SimAcmError {
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
 * Simulated ACM DNS validation failure.
 *
 * This is a simulator diagnostic rather than an AWS error: real ACM leaves a
 * certificate pending until validation times out hours later, which is no use
 * in a test. The message names the records that could not be published so the
 * missing Hosted Zone is obvious.
 */
export class SimAcmDnsValidationFailed extends SimAcmError {
  public override readonly name = "DnsValidationFailed";

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

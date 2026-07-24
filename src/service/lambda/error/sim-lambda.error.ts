/**
 * Minimal metadata shape for simulated Lambda errors.
 */
export interface SimLambdaErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated Lambda errors.
 */
export class SimLambdaError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimLambdaErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated Lambda ResourceConflictException error.
 */
export class SimLambdaResourceConflictException extends SimLambdaError {
  public override readonly name = "ResourceConflictException";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Simulated Lambda ResourceNotFoundException error.
 */
export class SimLambdaResourceNotFoundException extends SimLambdaError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated Lambda InvalidRequestContentException error.
 */
export class SimLambdaInvalidRequestContentException extends SimLambdaError {
  public override readonly name = "InvalidRequestContentException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Lambda InvalidParameterValueException error.
 *
 * Real Lambda reports function code problems this way, such as unreadable
 * zip file bytes or S3 code locations that cannot be fetched.
 */
export class SimLambdaInvalidParameterValueException extends SimLambdaError {
  public override readonly name = "InvalidParameterValueException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

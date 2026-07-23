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
 * Sim-specific error for Lambda function code input the simulator cannot run.
 *
 * Real Lambda accepts zipped source bundles; the simulator currently only
 * supports handler function references stowed away by makeLambdaZipFileInput.
 */
export class SimLambdaUnsupportedCodeInput extends SimLambdaError {
  public override readonly name = "SimLambdaUnsupportedCodeInput";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

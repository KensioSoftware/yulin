/**
 * Minimal metadata shape for simulated CloudFormation errors.
 */
export interface SimCloudFormationErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated CloudFormation errors.
 */
export class SimCloudFormationError extends Error {
  public readonly $fault = "client";

  constructor(
    message: string,
    public readonly $metadata: SimCloudFormationErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated CloudFormation AlreadyExistsException error.
 */
export class SimCloudFormationAlreadyExistsException extends SimCloudFormationError {
  public override readonly name = "AlreadyExistsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudFormation ValidationError.
 *
 * CloudFormation returns this for a request that names a Stack it cannot find,
 * which includes a Stack name that has been deleted.
 */
export class SimCloudFormationValidationError extends SimCloudFormationError {
  public override readonly name = "ValidationError";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

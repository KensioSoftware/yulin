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

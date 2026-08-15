/**
 * Minimal metadata shape for simulated ECR errors.
 */
export interface SimEcrErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated ECR errors.
 */
export class SimEcrError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimEcrErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated ECR InvalidParameterException error.
 *
 * Real ECR reports a repository name it will not accept this way. Nothing here
 * takes an SDK command, so this reaches a caller from a Yulin-native
 * registration rather than from a request.
 */
export class SimEcrInvalidParameterException extends SimEcrError {
  public override readonly name = "InvalidParameterException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

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

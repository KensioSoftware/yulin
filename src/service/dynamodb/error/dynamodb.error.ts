/**
 * Minimal metadata shape for simulated DynamoDB errors.
 */
export interface SimDynamoDbErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated DynamoDB errors.
 */
export class SimDynamoDbError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimDynamoDbErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated DynamoDB ResourceInUseException error.
 */
export class SimDynamoDbResourceInUseException extends SimDynamoDbError {
  public override readonly name = "ResourceInUseException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated DynamoDB ResourceNotFoundException error.
 */
export class SimDynamoDbResourceNotFoundException extends SimDynamoDbError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

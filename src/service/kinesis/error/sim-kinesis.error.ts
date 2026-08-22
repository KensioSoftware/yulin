/**
 * Minimal metadata shape for simulated Kinesis errors.
 */
export interface SimKinesisErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated Kinesis errors.
 */
export class SimKinesisError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimKinesisErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated Kinesis InvalidArgumentException error.
 *
 * Real Kinesis reports a malformed request this way: a stream name it will not
 * accept, a shard count outside its range, a record over the size limit, or a
 * shard iterator type it does not have.
 */
export class SimKinesisInvalidArgumentException extends SimKinesisError {
  public override readonly name = "InvalidArgumentException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Kinesis ResourceNotFoundException error.
 *
 * Real Kinesis reports a stream it does not hold this way, whichever operation
 * asked for it, and reports a stream in another Account the same way.
 */
export class SimKinesisResourceNotFoundException extends SimKinesisError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Kinesis ResourceInUseException error.
 *
 * Real Kinesis refuses a second stream under a name it already holds, and
 * refuses an operation on a stream that has yet to become `ACTIVE`.
 */
export class SimKinesisResourceInUseException extends SimKinesisError {
  public override readonly name = "ResourceInUseException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Kinesis ExpiredIteratorException error.
 *
 * Real Kinesis reports a shard iterator older than five minutes this way.
 * Nothing here expires an iterator, so this is raised for one the simulation
 * never issued, which is the other case real Kinesis refuses.
 */
export class SimKinesisExpiredIteratorException extends SimKinesisError {
  public override readonly name = "ExpiredIteratorException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Minimal metadata shape for simulated CloudWatch Logs errors.
 */
export interface SimLogsErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated CloudWatch Logs errors.
 */
export class SimLogsError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimLogsErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated CloudWatch Logs ResourceNotFoundException error.
 *
 * Real CloudWatch Logs reports an unknown log group or log stream this way,
 * including on a write: putting events to a stream that was never created
 * fails rather than creating it.
 */
export class SimLogsResourceNotFoundException extends SimLogsError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudWatch Logs ResourceAlreadyExistsException error.
 *
 * This is what creating a log group or log stream that is already there
 * produces. Creation is not idempotent on real CloudWatch Logs, so a test that
 * creates the same group twice should see the same failure it would see in an
 * account.
 */
export class SimLogsResourceAlreadyExistsException extends SimLogsError {
  public override readonly name = "ResourceAlreadyExistsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudWatch Logs InvalidParameterException error.
 *
 * Real CloudWatch Logs reports a malformed name, a retention value outside the
 * set it accepts, a batch of events out of order and a filter pattern it
 * cannot read all this way.
 */
export class SimLogsInvalidParameterException extends SimLogsError {
  public override readonly name = "InvalidParameterException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudWatch Logs UnsupportedOperationException error.
 *
 * This one is Yulin reporting a request real CloudWatch Logs would accept and
 * this simulator does not carry out, rather than a failure an account would
 * produce. Refusing is the honest answer: a filter pattern quietly treated as
 * matching everything would make a test pass for a reason that has nothing to
 * do with what it asserts.
 */
export class SimLogsUnsupportedOperationException extends SimLogsError {
  public override readonly name = "UnsupportedOperationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudWatch Logs LimitExceededException error.
 *
 * Real CloudWatch Logs reports an account or resource quota this way, such as
 * putting more subscription filters on a log group than it allows.
 */
export class SimLogsLimitExceededException extends SimLogsError {
  public override readonly name = "LimitExceededException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Minimal metadata shape for simulated CloudWatch errors.
 */
export interface SimCloudWatchErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated CloudWatch errors.
 */
export class SimCloudWatchError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimCloudWatchErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated CloudWatch InvalidParameterValueException error.
 *
 * Real CloudWatch reports a value it cannot accept this way: a reserved
 * namespace, a metric datum carrying no value at all, a period that is not a
 * multiple of sixty. Yulin also uses it for an input real CloudWatch would
 * accept and this simulation does not carry out, with a message saying so,
 * rather than inventing an error name the SDK has never seen.
 */
export class SimCloudWatchInvalidParameterValueException extends SimCloudWatchError {
  public override readonly name = "InvalidParameterValueException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudWatch MissingRequiredParameterException error.
 *
 * This is what leaving out a parameter the operation cannot run without
 * produces, such as a PutMetricData with no Namespace.
 */
export class SimCloudWatchMissingRequiredParameterException extends SimCloudWatchError {
  public override readonly name = "MissingRequiredParameterException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated CloudWatch InvalidParameterCombinationException error.
 *
 * Real CloudWatch reports parameters that are each valid but cannot be used
 * together this way, such as a time range and period that between them would
 * return more datapoints than one response holds.
 */
export class SimCloudWatchInvalidParameterCombinationException extends SimCloudWatchError {
  public override readonly name = "InvalidParameterCombinationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

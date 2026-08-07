/**
 * Minimal metadata shape for simulated SNS errors.
 */
export interface SimSnsErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated SNS errors.
 */
export class SimSnsError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimSnsErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated SNS AuthorizationErrorException.
 *
 * The name is the one the SDK gives the exception. Real SNS sends it on the
 * wire as `AuthorizationError`, which is the code a caller sees in a raw
 * response, and it carries a 403 rather than the 400 most SNS errors carry.
 */
export class SimSnsAuthorizationErrorException extends SimSnsError {
  public override readonly name = "AuthorizationErrorException";

  constructor(message: string) {
    super(message, { httpStatusCode: 403 });
  }
}

/**
 * Simulated SNS NotFoundException.
 *
 * This is what a topic ARN naming no topic produces, whether the topic never
 * existed, has been deleted, or belongs to another Account or Region.
 */
export class SimSnsNotFoundException extends SimSnsError {
  public override readonly name = "NotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated SNS InvalidParameterException.
 *
 * Real SNS reports a request input it will not take this way, such as a
 * malformed topic name, a subject over 100 characters, or a message larger
 * than it accepts. It goes on the wire as `InvalidParameter`.
 */
export class SimSnsInvalidParameterException extends SimSnsError {
  public override readonly name = "InvalidParameterException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SNS InvalidParameterValueException.
 *
 * Real SNS distinguishes this from an invalid parameter for a value it
 * understands but will not accept, such as an unusable message attribute. It
 * goes on the wire as `ParameterValueInvalid`.
 */
export class SimSnsInvalidParameterValueException extends SimSnsError {
  public override readonly name = "InvalidParameterValueException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SNS error for a request input this simulation does not model.
 *
 * This is not an error real SNS has, which is why it carries the name of the
 * one real SNS answers a parameter it will not take with. The input is refused
 * rather than ignored, because an ignored input looks applied to the request
 * that sent it and unapplied to everything else.
 */
export class SimSnsUnsimulatedInputException extends SimSnsError {
  public override readonly name = "InvalidParameterException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SNS EmptyBatchRequestException.
 */
export class SimSnsEmptyBatchRequestException extends SimSnsError {
  public override readonly name = "EmptyBatchRequestException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SNS TooManyEntriesInBatchRequestException.
 */
export class SimSnsTooManyEntriesInBatchRequestException extends SimSnsError {
  public override readonly name = "TooManyEntriesInBatchRequestException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SNS BatchEntryIdsNotDistinctException.
 */
export class SimSnsBatchEntryIdsNotDistinctException extends SimSnsError {
  public override readonly name = "BatchEntryIdsNotDistinctException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SNS InvalidBatchEntryIdException.
 */
export class SimSnsInvalidBatchEntryIdException extends SimSnsError {
  public override readonly name = "InvalidBatchEntryIdException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SNS BatchRequestTooLongException.
 *
 * A batch is held to the same 256 KB as one publish, over the whole batch
 * rather than over each entry.
 */
export class SimSnsBatchRequestTooLongException extends SimSnsError {
  public override readonly name = "BatchRequestTooLongException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

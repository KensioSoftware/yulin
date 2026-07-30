/**
 * Minimal metadata shape for simulated SQS errors.
 */
export interface SimSqsErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated SQS errors.
 */
export class SimSqsError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimSqsErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated SQS QueueDoesNotExist error.
 *
 * The name is the one the SDK gives the exception. Real SQS sends it on the
 * wire as `AWS.SimpleQueueService.NonExistentQueue`.
 */
export class SimSqsQueueDoesNotExist extends SimSqsError {
  public override readonly name = "QueueDoesNotExist";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS QueueNameExists error.
 *
 * CreateQueue answers this when the name is taken and the request carries
 * attributes differing from the existing queue's. Real SQS sends it on the wire
 * as `QueueAlreadyExists`.
 */
export class SimSqsQueueNameExists extends SimSqsError {
  public override readonly name = "QueueNameExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS QueueDeletedRecently error.
 *
 * Real SQS holds a deleted queue's name for 60 seconds, so a name cannot be
 * reused immediately after DeleteQueue.
 */
export class SimSqsQueueDeletedRecently extends SimSqsError {
  public override readonly name = "QueueDeletedRecently";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS InvalidAddress error.
 *
 * This is what a QueueUrl that is not a queue URL at all produces.
 */
export class SimSqsInvalidAddress extends SimSqsError {
  public override readonly name = "InvalidAddress";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS InvalidAttributeName error.
 *
 * Real SQS reports an attribute name it has no such attribute for this way,
 * including a read-only attribute a SetQueueAttributes request tries to set.
 */
export class SimSqsInvalidAttributeName extends SimSqsError {
  public override readonly name = "InvalidAttributeName";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS InvalidAttributeValue error.
 *
 * This is an attribute value outside the range real SQS accepts for it.
 */
export class SimSqsInvalidAttributeValue extends SimSqsError {
  public override readonly name = "InvalidAttributeValue";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS InvalidParameterValue error.
 *
 * Real SQS reports a request input outside the range it accepts this way, such
 * as a MaxNumberOfMessages above ten or a malformed queue name.
 */
export class SimSqsInvalidParameterValue extends SimSqsError {
  public override readonly name = "InvalidParameterValue";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS InvalidMessageContents error.
 *
 * A message body may only carry the characters real SQS allows, which is a
 * subset of Unicode rather than any string.
 */
export class SimSqsInvalidMessageContents extends SimSqsError {
  public override readonly name = "InvalidMessageContents";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS ReceiptHandleIsInvalid error.
 *
 * This is a receipt handle the queue never issued. A handle it did issue for a
 * message received again since is valid but stale, which is a different thing.
 */
export class SimSqsReceiptHandleIsInvalid extends SimSqsError {
  public override readonly name = "ReceiptHandleIsInvalid";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS MessageNotInflight error.
 *
 * ChangeMessageVisibility answers this for a message that is not currently
 * hidden, since there is no visibility timeout left to change.
 */
export class SimSqsMessageNotInflight extends SimSqsError {
  public override readonly name = "MessageNotInflight";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS EmptyBatchRequest error.
 */
export class SimSqsEmptyBatchRequest extends SimSqsError {
  public override readonly name = "EmptyBatchRequest";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS TooManyEntriesInBatchRequest error.
 */
export class SimSqsTooManyEntriesInBatchRequest extends SimSqsError {
  public override readonly name = "TooManyEntriesInBatchRequest";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS BatchEntryIdsNotDistinct error.
 */
export class SimSqsBatchEntryIdsNotDistinct extends SimSqsError {
  public override readonly name = "BatchEntryIdsNotDistinct";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS InvalidBatchEntryId error.
 */
export class SimSqsInvalidBatchEntryId extends SimSqsError {
  public override readonly name = "InvalidBatchEntryId";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS UnsupportedOperation error.
 *
 * This is what simulated SQS refuses a real SQS feature it does not simulate
 * with, such as a FIFO queue or a redrive policy. Refusing is deliberate: a
 * request that quietly did something else would pass here and behave
 * differently on AWS.
 */
export class SimSqsUnsupportedOperation extends SimSqsError {
  public override readonly name = "UnsupportedOperation";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SQS ValidationException error.
 *
 * Real SQS reports a missing required request input this way.
 */
export class SimSqsValidationException extends SimSqsError {
  public override readonly name = "ValidationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

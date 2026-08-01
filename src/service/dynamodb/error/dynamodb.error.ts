import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import type { SimDynamoDbCancellationReason } from "../command/transact/transact.command.js";

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

/**
 * Simulated DynamoDB ValidationException error.
 *
 * Real DynamoDB answers request input it will not accept this way: a table name
 * of the wrong shape, a key schema in the wrong order, an attribute definition
 * no key uses, a billing mode and a throughput that contradict each other.
 */
export class SimDynamoDbValidationException extends SimDynamoDbError {
  public override readonly name = "ValidationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated DynamoDB ConditionalCheckFailedException error.
 *
 * This is what a write guarded by a ConditionExpression fails with when the
 * condition did not hold. The name and the message are the ones real DynamoDB
 * uses, so code that catches it by either works here unchanged.
 *
 * `Item` carries the item that was there, and only when the request asked for
 * it with ReturnValuesOnConditionCheckFailure.
 */
export class SimDynamoDbConditionalCheckFailedException extends SimDynamoDbError {
  public override readonly name = "ConditionalCheckFailedException";

  public readonly Item:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;

  constructor(item?: Readonly<Record<string, SimDynamoDbAttributeValue>>) {
    super("The conditional request failed.", { httpStatusCode: 400 });
    this.Item = item;
  }
}

/**
 * Simulated DynamoDB TransactionCanceledException error.
 *
 * This is what a transactional write fails with when any of its actions could
 * not be applied. Nothing was written: the actions are checked before the first
 * of them changes anything.
 *
 * `CancellationReasons` lines up with the `TransactItems` of the request, one
 * entry per action and in the same order, including the actions nothing was
 * wrong with. Those carry the code `None`, which is how a caller reads which of
 * its actions was the one that failed.
 *
 * The message lists the codes in the same order, as real DynamoDB does, so an
 * application logging the message alone still records which action failed.
 */
export class SimDynamoDbTransactionCanceledException extends SimDynamoDbError {
  public override readonly name = "TransactionCanceledException";

  public readonly CancellationReasons: readonly SimDynamoDbCancellationReason[];

  constructor(reasons: readonly SimDynamoDbCancellationReason[]) {
    super(
      `Transaction cancelled, please refer cancellation reasons for specific ` +
        `reasons [${reasons.map((reason) => reason.Code).join(", ")}]`,
      { httpStatusCode: 400 },
    );
    this.CancellationReasons = reasons;
  }
}

/**
 * Simulated DynamoDB IdempotentParameterMismatchException error.
 *
 * A ClientRequestToken makes a retry idempotent, so it stands for the request
 * it was first used with. Replaying it with a different request inside the
 * idempotency window is refused rather than applied, since either applying it
 * or answering with the first request's result would be wrong.
 */
export class SimDynamoDbIdempotentParameterMismatchException extends SimDynamoDbError {
  public override readonly name = "IdempotentParameterMismatchException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated DynamoDB DocumentValueError.
 *
 * Real DynamoDB has no error of this name, and neither does the real document
 * client, which refuses a value it cannot convert with a plain Error. It is
 * what the simulated document client layer refuses one with, before the request
 * reaches the simulated service, which is where the real one refuses it too.
 *
 * The message names the path the value sits at, which the real one does not.
 */
export class SimDynamoDbDocumentValueError extends SimDynamoDbError {
  public override readonly name = "DocumentValueError";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated DynamoDB UnsupportedOperation error.
 *
 * Real DynamoDB has no error of this name. It is what simulated DynamoDB
 * refuses request input it does not model with, and it is deliberately not a
 * ValidationException: real DynamoDB accepts this input, so a refusal here says
 * the simulation stops short rather than that the request was wrong.
 */
export class SimDynamoDbUnsupportedOperation extends SimDynamoDbError {
  public override readonly name = "UnsupportedOperation";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

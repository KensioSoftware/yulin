import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";

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

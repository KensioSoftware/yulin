/**
 * Minimal metadata shape for simulated EventBridge errors.
 */
export interface SimEventBridgeErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated EventBridge errors.
 */
export class SimEventBridgeError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimEventBridgeErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated EventBridge AccessDeniedException.
 *
 * EventBridge has no error of its own for an IAM denial, unlike SNS, so a
 * refused request gets the standard AWS one.
 */
export class SimEventBridgeAccessDeniedException extends SimEventBridgeError {
  public override readonly name = "AccessDeniedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 403 });
  }
}

/**
 * Simulated EventBridge ResourceNotFoundException.
 *
 * This is what naming a bus that is not there produces, whether it never
 * existed, has been deleted, or belongs to another Account or Region. Note
 * that PutEvents is the exception: it accepts an event for a bus that does not
 * exist rather than refusing it.
 *
 * Real EventBridge answers it with a 400 rather than the 404 the name
 * suggests.
 */
export class SimEventBridgeResourceNotFoundException extends SimEventBridgeError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated EventBridge ResourceAlreadyExistsException.
 */
export class SimEventBridgeResourceAlreadyExistsException extends SimEventBridgeError {
  public override readonly name = "ResourceAlreadyExistsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated EventBridge ValidationException.
 *
 * Real EventBridge reports request input it will not take this way, such as a
 * bus name outside the allowed characters or an attempt to delete the default
 * bus.
 */
export class SimEventBridgeValidationException extends SimEventBridgeError {
  public override readonly name = "ValidationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated EventBridge error for a request input this simulation does not
 * model.
 *
 * This is not an error real EventBridge has, which is why it carries the name
 * of the one real EventBridge answers an unusable parameter with. The input is
 * refused rather than ignored, because an ignored input looks applied to the
 * request that sent it and unapplied to everything else.
 */
export class SimEventBridgeUnsimulatedInputException extends SimEventBridgeError {
  public override readonly name = "ValidationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

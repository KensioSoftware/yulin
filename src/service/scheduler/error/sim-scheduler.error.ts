/**
 * Minimal metadata shape for simulated EventBridge Scheduler errors.
 */
export interface SimSchedulerErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated EventBridge Scheduler errors.
 */
export class SimSchedulerError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimSchedulerErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated Scheduler AccessDeniedException.
 */
export class SimSchedulerAccessDeniedException extends SimSchedulerError {
  public override readonly name = "AccessDeniedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 403 });
  }
}

/**
 * Simulated Scheduler ValidationException.
 *
 * This is what request input Scheduler will not take produces, such as a
 * schedule name outside the allowed characters or an expression it cannot read.
 */
export class SimSchedulerValidationException extends SimSchedulerError {
  public override readonly name = "ValidationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Scheduler ResourceNotFoundException.
 *
 * Scheduler answers this with a 404, unlike EventBridge, which answers its own
 * not-found with a 400.
 */
export class SimSchedulerResourceNotFoundException extends SimSchedulerError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated Scheduler ConflictException.
 *
 * Creating a schedule that already exists is this rather than a replacement,
 * which is the difference between `CreateSchedule` and EventBridge's `PutRule`.
 */
export class SimSchedulerConflictException extends SimSchedulerError {
  public override readonly name = "ConflictException";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Request input that real Scheduler takes and this simulation does not.
 *
 * Held apart from a validation failure because the two mean different things:
 * one says the request is wrong, and this one says the request is right and the
 * simulator does not go that far. Dropping the input instead would leave a
 * schedule looking configured to whoever sent it and unconfigured to
 * everything else.
 */
export class SimSchedulerUnsimulatedInputException extends SimSchedulerError {
  public override readonly name = "UnsimulatedInputException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Minimal metadata shape for simulated Personalize errors.
 */
export interface SimPersonalizeErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated Personalize errors.
 */
export class SimPersonalizeError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimPersonalizeErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated Personalize ResourceNotFoundException error.
 *
 * Real Personalize reports an ARN naming nothing this way, whether the ARN is
 * the target of the request or a parent the request names.
 */
export class SimPersonalizeResourceNotFoundException extends SimPersonalizeError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Personalize ResourceAlreadyExistsException error.
 *
 * Real Personalize refuses a second resource of the same type and name this
 * way.
 */
export class SimPersonalizeResourceAlreadyExistsException extends SimPersonalizeError {
  public override readonly name = "ResourceAlreadyExistsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Personalize InvalidInputException error.
 *
 * This is the failure the request input produces on its own: a missing
 * required field, a name breaking the pattern, or a value outside the set the
 * API accepts.
 */
export class SimPersonalizeInvalidInputException extends SimPersonalizeError {
  public override readonly name = "InvalidInputException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Personalize ResourceInUseException error.
 *
 * This is the failure the state of other resources produces: deleting a
 * dataset group still holding datasets, or a solution still holding versions.
 */
export class SimPersonalizeResourceInUseException extends SimPersonalizeError {
  public override readonly name = "ResourceInUseException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Personalize AccessDeniedException error.
 *
 * A caller simulated IAM denies is reported in Personalize's own terms rather
 * than through the shared IAM error, because that is the error name a real
 * Personalize caller has to handle.
 */
export class SimPersonalizeAccessDeniedException extends SimPersonalizeError {
  public override readonly name = "AccessDeniedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

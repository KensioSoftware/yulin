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

/**
 * Simulated Personalize InvalidNextTokenException error.
 *
 * This is the one error the list operations declare. A token real Personalize
 * never handed out is reported this way rather than as invalid input.
 */
export class SimPersonalizeInvalidNextTokenException extends SimPersonalizeError {
  public override readonly name = "InvalidNextTokenException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Personalize error for a request input this simulation does not
 * model.
 *
 * This is not an error real Personalize has, and it is reported under the name
 * real Personalize refuses bad input with. The input is refused rather than
 * ignored, because an ignored input looks applied to the request that sent it
 * and unapplied to everything else. A `filterArn` naming a filter that keeps
 * out-of-stock items out is the case worth refusing: the recommendations would
 * come back whole here and come back filtered on AWS.
 */
export class SimPersonalizeUnsimulatedInputException extends SimPersonalizeError {
  public override readonly name = "InvalidInputException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Personalize error for a result declared against this simulation
 * that it cannot answer with.
 *
 * This is a simulator configuration error rather than an AWS one, so it is
 * raised where the declaration is made rather than where the recommendation is
 * served. Recommendations declared against a campaign ARN nothing holds would
 * otherwise sit there unanswered, and the test would read the empty item list
 * as the system under test asking for the wrong item.
 */
export class SimPersonalizeDeclarationError extends SimPersonalizeError {
  public override readonly name = "SimPersonalizeDeclarationError";
}

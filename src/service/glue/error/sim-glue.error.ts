/**
 * Minimal metadata shape for simulated Glue errors.
 */
export interface SimGlueErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated Glue errors.
 */
export class SimGlueError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimGlueErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated Glue EntityNotFoundException.
 *
 * Real Glue answers with this for a database or table that is absent, and for
 * a `CreateTable` naming a database that is absent.
 */
export class SimGlueEntityNotFoundException extends SimGlueError {
  public override readonly name = "EntityNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Glue AlreadyExistsException.
 */
export class SimGlueAlreadyExistsException extends SimGlueError {
  public override readonly name = "AlreadyExistsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Glue InvalidInputException.
 */
export class SimGlueInvalidInputException extends SimGlueError {
  public override readonly name = "InvalidInputException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Minimal metadata shape for simulated SSM errors.
 */
export interface SimSsmErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated SSM errors.
 */
export class SimSsmError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimSsmErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated SSM ParameterNotFound error.
 *
 * Real Parameter Store reports an unknown parameter name and an unknown label
 * this way.
 */
export class SimSsmParameterNotFound extends SimSsmError {
  public override readonly name = "ParameterNotFound";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SSM ParameterVersionNotFound error.
 *
 * This is what a numbered version selector produces when the parameter exists
 * but that version of it does not.
 */
export class SimSsmParameterVersionNotFound extends SimSsmError {
  public override readonly name = "ParameterVersionNotFound";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SSM ParameterAlreadyExists error.
 *
 * PutParameter produces this when the name is taken and the request did not
 * ask to overwrite.
 */
export class SimSsmParameterAlreadyExists extends SimSsmError {
  public override readonly name = "ParameterAlreadyExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SSM ParameterPatternMismatchException error.
 *
 * This is the failure a malformed parameter name produces: disallowed
 * characters, a hierarchy without its leading slash, or a reserved prefix.
 */
export class SimSsmParameterPatternMismatchException extends SimSsmError {
  public override readonly name = "ParameterPatternMismatchException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SSM HierarchyLevelLimitExceededException error.
 */
export class SimSsmHierarchyLevelLimitExceededException extends SimSsmError {
  public override readonly name = "HierarchyLevelLimitExceededException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SSM HierarchyTypeMismatchException error.
 *
 * Parameter Store refuses to change the type of an existing parameter, so an
 * overwrite naming a different type fails rather than converting it.
 */
export class SimSsmHierarchyTypeMismatchException extends SimSsmError {
  public override readonly name = "HierarchyTypeMismatchException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SSM UnsupportedParameterType error.
 */
export class SimSsmUnsupportedParameterType extends SimSsmError {
  public override readonly name = "UnsupportedParameterType";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SSM ValidationException error.
 *
 * Real Parameter Store reports a missing or malformed request input this way,
 * and it is also what this simulation refuses an unsimulated input with.
 */
export class SimSsmValidationException extends SimSsmError {
  public override readonly name = "ValidationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

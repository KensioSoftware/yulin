export interface SimBackupErrorMetadata {
  readonly httpStatusCode?: number | undefined;
}

/**
 *
 */
export class SimBackupError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimBackupErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 *
 */
export class SimBackupAccessDeniedException extends SimBackupError {
  override readonly name = "AccessDeniedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 403 });
  }
}

/**
 *
 */
export class SimBackupAlreadyExistsException extends SimBackupError {
  override readonly name = "AlreadyExistsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 *
 */
export class SimBackupInvalidParameterValueException extends SimBackupError {
  override readonly name = "InvalidParameterValueException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 *
 */
export class SimBackupMissingParameterValueException extends SimBackupError {
  override readonly name = "MissingParameterValueException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 *
 */
export class SimBackupResourceNotFoundException extends SimBackupError {
  override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

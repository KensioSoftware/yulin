export interface SimBackupErrorMetadata {
  readonly httpStatusCode?: number | undefined;
}

/** Base class for AWS Backup service errors. */
export class SimBackupError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimBackupErrorMetadata = {},
  ) {
    super(message);
  }
}

/** AWS Backup refused the caller's permissions. */
export class SimBackupAccessDeniedException extends SimBackupError {
  override readonly name = "AccessDeniedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 403 });
  }
}

/** AWS Backup found a resource with the requested identity. */
export class SimBackupAlreadyExistsException extends SimBackupError {
  override readonly name = "AlreadyExistsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/** AWS Backup refused a parameter value. */
export class SimBackupInvalidParameterValueException extends SimBackupError {
  override readonly name = "InvalidParameterValueException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/** AWS Backup refused a request that is invalid for the resource state. */
export class SimBackupInvalidRequestException extends SimBackupError {
  override readonly name = "InvalidRequestException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/** AWS Backup found a required parameter missing. */
export class SimBackupMissingParameterValueException extends SimBackupError {
  override readonly name = "MissingParameterValueException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/** AWS Backup could not find the requested resource. */
export class SimBackupResourceNotFoundException extends SimBackupError {
  override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

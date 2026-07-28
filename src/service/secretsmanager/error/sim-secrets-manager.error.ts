/**
 * Minimal metadata shape for simulated Secrets Manager errors.
 */
export interface SimSecretsManagerErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated Secrets Manager errors.
 */
export class SimSecretsManagerError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimSecretsManagerErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated Secrets Manager ResourceNotFoundException error.
 *
 * Real Secrets Manager reports an unknown secret, an unknown version, and a
 * secret belonging to another Account or Region all this way.
 */
export class SimSecretsManagerResourceNotFoundException extends SimSecretsManagerError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Secrets Manager ResourceExistsException error.
 *
 * Real Secrets Manager uses this for a secret name already in use and for a
 * version id already used by a different value.
 */
export class SimSecretsManagerResourceExistsException extends SimSecretsManagerError {
  public override readonly name = "ResourceExistsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Secrets Manager InvalidRequestException error.
 *
 * This is the failure a secret's state produces rather than its input: reading
 * or writing a secret that is scheduled for deletion, or deleting one twice.
 */
export class SimSecretsManagerInvalidRequestException extends SimSecretsManagerError {
  public override readonly name = "InvalidRequestException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Secrets Manager InvalidParameterException error.
 *
 * This is the failure a malformed or contradictory request input produces,
 * such as both SecretString and SecretBinary, or a recovery window alongside
 * ForceDeleteWithoutRecovery.
 */
export class SimSecretsManagerInvalidParameterException extends SimSecretsManagerError {
  public override readonly name = "InvalidParameterException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

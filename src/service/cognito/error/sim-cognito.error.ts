/**
 * Minimal metadata shape for simulated Cognito errors.
 */
export interface SimCognitoErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated Cognito user pools errors.
 */
export class SimCognitoError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimCognitoErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated Cognito ResourceNotFoundException error.
 *
 * Real Cognito reports an unknown user pool id and an unknown app client id
 * this way.
 */
export class SimCognitoResourceNotFoundException extends SimCognitoError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Cognito InvalidParameterException error.
 *
 * Real Cognito reports a missing or malformed request input this way, and it
 * is also what this simulation refuses an unsimulated input with.
 */
export class SimCognitoInvalidParameterException extends SimCognitoError {
  public override readonly name = "InvalidParameterException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

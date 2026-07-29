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

/**
 * Simulated Cognito UsernameExistsException error.
 *
 * Real Cognito reports a second user created with a username the pool already
 * holds this way.
 */
export class SimCognitoUsernameExistsException extends SimCognitoError {
  public override readonly name = "UsernameExistsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Cognito UserNotFoundException error.
 *
 * Real Cognito reports an operation naming a user its pool does not hold this
 * way, rather than as a missing resource.
 */
export class SimCognitoUserNotFoundException extends SimCognitoError {
  public override readonly name = "UserNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Cognito InvalidPasswordException error.
 *
 * Real Cognito reports a password its pool's password policy does not allow
 * this way, and says which rule the password broke.
 */
export class SimCognitoInvalidPasswordException extends SimCognitoError {
  public override readonly name = "InvalidPasswordException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

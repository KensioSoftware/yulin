/**
 * Minimal metadata shape for simulated ECS errors.
 */
export interface SimEcsErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated ECS errors.
 */
export class SimEcsError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimEcsErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated ECS ClientException error.
 *
 * Real ECS reports most request-level problems this way rather than with a
 * more specific error, including a task definition it cannot describe.
 */
export class SimEcsClientException extends SimEcsError {
  public override readonly name = "ClientException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ECS InvalidParameterException error.
 */
export class SimEcsInvalidParameterException extends SimEcsError {
  public override readonly name = "InvalidParameterException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ECS ClusterNotFoundException error.
 */
export class SimEcsClusterNotFoundException extends SimEcsError {
  public override readonly name = "ClusterNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ECS ServiceNotFoundException error.
 */
export class SimEcsServiceNotFoundException extends SimEcsError {
  public override readonly name = "ServiceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ECS AccessDeniedException error.
 */
export class SimEcsAccessDeniedException extends SimEcsError {
  public override readonly name = "AccessDeniedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

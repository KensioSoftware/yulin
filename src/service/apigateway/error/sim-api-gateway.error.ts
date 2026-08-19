/**
 * Minimal metadata shape for simulated API Gateway errors.
 */
export interface SimApiGatewayErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated API Gateway REST API errors.
 */
export class SimApiGatewayError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimApiGatewayErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated API Gateway BadRequestException.
 *
 * The v1 API answers an unacceptable request with this exception, and every
 * input refusal here is one of them.
 */
export class SimApiGatewayBadRequest extends SimApiGatewayError {
  public override readonly name = "BadRequestException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated API Gateway NotFoundException.
 */
export class SimApiGatewayNotFound extends SimApiGatewayError {
  public override readonly name = "NotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated API Gateway ConflictException.
 *
 * A second resource claiming an identity another one already holds produces
 * this, such as a path part already taken under the same parent.
 */
export class SimApiGatewayConflict extends SimApiGatewayError {
  public override readonly name = "ConflictException";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

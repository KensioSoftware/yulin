/**
 * Minimal metadata shape for simulated API Gateway v2 errors.
 */
export interface SimApiGatewayV2ErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated API Gateway v2 errors.
 */
export class SimApiGatewayV2Error extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimApiGatewayV2ErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated API Gateway v2 BadRequestException.
 *
 * The v2 API answers a malformed or unacceptable request body with this one
 * exception rather than a per-parameter error, so every input refusal here is
 * one of these.
 */
export class SimApiGatewayV2BadRequest extends SimApiGatewayV2Error {
  public override readonly name = "BadRequestException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated API Gateway v2 NotFoundException.
 */
export class SimApiGatewayV2NotFound extends SimApiGatewayV2Error {
  public override readonly name = "NotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated API Gateway v2 ConflictException.
 *
 * This is what a second resource claiming an identity another one already has
 * produces, such as a route key that is already routed.
 */
export class SimApiGatewayV2Conflict extends SimApiGatewayV2Error {
  public override readonly name = "ConflictException";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

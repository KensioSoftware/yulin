/**
 * Minimal metadata shape for simulated Athena errors.
 */
export interface SimAthenaErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated Athena errors.
 */
export class SimAthenaError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimAthenaErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated Athena InvalidRequestException.
 *
 * Athena answers most of what other services split into validation and
 * not-found with this one error. A workgroup that is absent, a name that is
 * already taken and a request field it will not take all arrive as an
 * `InvalidRequestException` with a 400, so they are one class here too.
 */
export class SimAthenaInvalidRequestException extends SimAthenaError {
  public override readonly name = "InvalidRequestException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Athena AccessDeniedException.
 */
export class SimAthenaAccessDeniedException extends SimAthenaError {
  public override readonly name = "AccessDeniedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 403 });
  }
}

/**
 * Minimal metadata shape for simulated SES errors.
 */
export interface SimSesErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated SES errors.
 */
export class SimSesError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimSesErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated SES BadRequestException error.
 *
 * This is what the SES v2 API reports for input it will not accept, such as an
 * identity that is neither an email address nor a domain.
 */
export class SimSesBadRequestException extends SimSesError {
  public override readonly name = "BadRequestException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SES NotFoundException error.
 *
 * Reading or deleting an identity that is not there produces this, and so does
 * sending with a template name that names nothing.
 */
export class SimSesNotFoundException extends SimSesError {
  public override readonly name = "NotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated SES AlreadyExistsException error.
 *
 * Creating an identity that is already there fails rather than answering with
 * the one that exists, so a test that verifies the same address twice sees the
 * failure an account would give it.
 */
export class SimSesAlreadyExistsException extends SimSesError {
  public override readonly name = "AlreadyExistsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SES MessageRejected error.
 *
 * SES reports a message it will not accept this way, and an unverified
 * identity is much the commonest reason for it. The message names the
 * identities that failed the check, because that is the part a caller has to
 * read to find out what to verify.
 */
export class SimSesMessageRejected extends SimSesError {
  public override readonly name = "MessageRejected";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SES UnsupportedOperationException error.
 *
 * This one is Yulin reporting a request real SES would accept and this
 * simulator does not carry out, rather than a failure an account would
 * produce. Refusing is the honest answer: a raw MIME message quietly recorded
 * with an empty body would make a test pass for a reason unrelated to what it
 * asserts.
 */
export class SimSesUnsupportedOperationException extends SimSesError {
  public override readonly name = "UnsupportedOperationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated SES SendingPausedException error.
 *
 * SES reports a send it will not make because sending is switched off. Here
 * that means a configuration set created with `SendingEnabled: false`. That
 * switch is a declaration the caller wrote deliberately, and this simulation
 * follows it.
 */
export class SimSesSendingPausedException extends SimSesError {
  public override readonly name = "SendingPausedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

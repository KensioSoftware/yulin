/**
 * Minimal metadata shape for simulated Bedrock errors.
 */
export interface SimBedrockErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated Bedrock errors.
 */
export class SimBedrockError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimBedrockErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated Bedrock ValidationException error.
 *
 * This is the failure the request input produces on its own: a missing model
 * id, a conversation with no messages, or a value outside the set the API
 * accepts.
 */
export class SimBedrockValidationException extends SimBedrockError {
  public override readonly name = "ValidationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Bedrock AccessDeniedException error.
 *
 * A caller simulated IAM denies is reported in Bedrock's own terms rather than
 * through the shared IAM error, because that is the error name a real Bedrock
 * caller has to handle. Real Bedrock answers it with a 403.
 */
export class SimBedrockAccessDeniedException extends SimBedrockError {
  public override readonly name = "AccessDeniedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 403 });
  }
}

/**
 * Simulated Bedrock error for a request input this simulation does not model.
 *
 * This is not an error real Bedrock has, and it is reported under the name
 * real Bedrock refuses bad input with. The input is refused rather than
 * ignored, because an ignored input looks applied to the request that sent it
 * and unapplied to everything else. A `guardrailConfig` naming a guardrail
 * that blocks a prompt is the case worth refusing: the response would come
 * back whole here and come back blocked on AWS.
 */
export class SimBedrockUnsimulatedInputException extends SimBedrockError {
  public override readonly name = "ValidationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Bedrock error for a response declared against this simulation that
 * it cannot answer with.
 *
 * This is a simulator configuration error rather than an AWS one. A content
 * block naming two kinds of content at once is refused where the declaration
 * was written. A declaration carrying nothing the operation asking for it can
 * use is refused where the call is made, since which operation reaches a rule
 * is only known then.
 */
export class SimBedrockDeclarationError extends SimBedrockError {
  public override readonly name = "SimBedrockDeclarationError";
}

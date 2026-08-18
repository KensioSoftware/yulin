/**
 * Minimal metadata shape for simulated Rekognition errors.
 */
export interface SimRekognitionErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated Rekognition errors.
 */
export class SimRekognitionError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimRekognitionErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated Rekognition InvalidParameterException error.
 *
 * Real Rekognition reports a malformed request this way: an image with
 * neither bytes nor an S3 object, both at once, or a MinConfidence outside
 * the range it accepts.
 */
export class SimRekognitionInvalidParameterException extends SimRekognitionError {
  public override readonly name = "InvalidParameterException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Rekognition InvalidS3ObjectException error.
 *
 * Real Rekognition reports every S3 problem this way, whether the Bucket is
 * missing, the object is missing, or its own role cannot read it. The
 * simulator's underlying error is kept as the `cause`, so a missing
 * `s3:GetObject` grant is still diagnosable from the thrown error.
 */
export class SimRekognitionInvalidS3ObjectException extends SimRekognitionError {
  public override readonly name = "InvalidS3ObjectException";

  constructor(message: string, options: { readonly cause?: unknown } = {}) {
    super(message, { httpStatusCode: 400 });

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * Simulated Rekognition InvalidImageFormatException error.
 *
 * Real Rekognition accepts PNG and JPEG image bytes and reports anything else
 * this way, including bytes that are not an image at all.
 */
export class SimRekognitionInvalidImageFormatException extends SimRekognitionError {
  public override readonly name = "InvalidImageFormatException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Rekognition AccessDeniedException error.
 *
 * Rekognition reports an IAM denial under its own error name with a 400
 * status rather than the 403 several other services use, so the simulation
 * raises its own error here instead of letting the shared IAM one out. A test
 * asserting on `AccessDeniedException` is asserting on what real Rekognition
 * would have thrown.
 */
export class SimRekognitionAccessDeniedException extends SimRekognitionError {
  public override readonly name = "AccessDeniedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Rekognition ResourceAlreadyExistsException error.
 *
 * Real Rekognition refuses a second collection under a name it already holds
 * rather than answering with the one that is there.
 */
export class SimRekognitionResourceAlreadyExistsException extends SimRekognitionError {
  public override readonly name = "ResourceAlreadyExistsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Rekognition ResourceNotFoundException error.
 *
 * Real Rekognition reports a collection it does not hold this way, whichever
 * operation asked for it.
 */
export class SimRekognitionResourceNotFoundException extends SimRekognitionError {
  public override readonly name = "ResourceNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Rekognition error for a request input this simulation does not
 * model.
 *
 * This is not an error real Rekognition has. It is refused here rather than
 * ignored, because an ignored input looks applied to the request that sent it
 * and unapplied to everything else.
 */
export class SimRekognitionUnsimulatedInputException extends SimRekognitionError {
  public override readonly name = "InvalidParameterException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Rekognition error for a result declared against this simulation
 * that it cannot answer with.
 *
 * This is a simulator configuration error rather than an AWS one, so it is
 * raised where the declaration is made rather than where the detection runs.
 * A moderation label real Rekognition has never heard of would otherwise sit
 * there until a detection returned it, and a test asserting on it would pass
 * against something AWS could not produce.
 */
export class SimRekognitionDeclarationError extends SimRekognitionError {
  public override readonly name = "SimRekognitionDeclarationError";
}

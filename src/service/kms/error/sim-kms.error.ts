/**
 * Minimal metadata shape for simulated KMS errors.
 */
export interface SimKmsErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated KMS errors.
 */
export class SimKmsError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimKmsErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated KMS NotFoundException error.
 *
 * Real KMS reports a key, alias or key ARN it cannot find this way, whether
 * the identifier is unknown or belongs to another Account or Region.
 */
export class SimKmsNotFoundException extends SimKmsError {
  public override readonly name = "NotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated KMS AlreadyExistsException error.
 */
export class SimKmsAlreadyExistsException extends SimKmsError {
  public override readonly name = "AlreadyExistsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated KMS DisabledException error.
 *
 * Real KMS distinguishes a disabled key from one pending deletion: a
 * cryptographic operation on a disabled key fails this way, while a key
 * pending deletion fails with KMSInvalidStateException.
 */
export class SimKmsDisabledException extends SimKmsError {
  public override readonly name = "DisabledException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated KMS KMSInvalidStateException error.
 */
export class SimKmsInvalidStateException extends SimKmsError {
  public override readonly name = "KMSInvalidStateException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated KMS InvalidCiphertextException error.
 *
 * This covers every reason a ciphertext will not open: it was not produced by
 * this simulation, it was produced under a different key, or the encryption
 * context does not match the one it was encrypted with. Real KMS is equally
 * uninformative here on purpose, because saying more would leak something
 * about the key or the plaintext.
 */
export class SimKmsInvalidCiphertextException extends SimKmsError {
  public override readonly name = "InvalidCiphertextException";

  constructor(message = "The ciphertext refers to a key that does not exist") {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated KMS IncorrectKeyException error.
 *
 * Decrypt was given a KeyId, and the ciphertext was produced under a different
 * key. Naming the key is optional for a symmetric ciphertext precisely because
 * the blob already says which key made it, so a mismatch means the caller's
 * expectation was wrong rather than the ciphertext being unreadable.
 */
export class SimKmsIncorrectKeyException extends SimKmsError {
  public override readonly name = "IncorrectKeyException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated KMS ValidationException error.
 */
export class SimKmsValidationException extends SimKmsError {
  public override readonly name = "ValidationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated KMS InvalidKeyUsageException error.
 */
export class SimKmsInvalidKeyUsageException extends SimKmsError {
  public override readonly name = "InvalidKeyUsageException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

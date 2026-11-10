import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamAccessDeniedInput } from "../../iam/error/sim-iam.error.js";
import { SimIamCallerIdentifier } from "../../iam/error/sim-iam-caller-identifier.js";

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

/**
 * Simulated KMS UnsupportedOperationException error.
 *
 * Real KMS keeps this apart from InvalidKeyUsageException, and GetPublicKey is
 * where the difference shows: a symmetric key has no public key to hand out at
 * all, rather than having one it is not allowed to use for the operation.
 */
export class SimKmsUnsupportedOperationException extends SimKmsError {
  public override readonly name = "UnsupportedOperationException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated KMS KMSInvalidSignatureException error.
 *
 * Verify reports a signature that does not check out by failing rather than by
 * returning SignatureValid false, which is what real KMS does and what code
 * written against it handles.
 */
export class SimKmsInvalidSignatureException extends SimKmsError {
  public override readonly name = "KMSInvalidSignatureException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated KMS AccessDeniedException error.
 *
 * Real KMS refuses a request its key policy, IAM policies and grants do not
 * allow with this name rather than IAM's `AccessDenied`. The message keeps the
 * IAM shape, naming the caller, the `kms:` action and the key ARN, and the
 * status is 400 like every other KMS client error: the SDKs report
 * `Status Code: 400; Error Code: AccessDeniedException` for it, even though the
 * shared list of common AWS errors gives 403.
 */
export class SimKmsAccessDeniedException extends SimKmsError {
  public override readonly name = "AccessDeniedException";

  public readonly caller: SimAwsPrincipal;
  public readonly action: string;
  public readonly resource: string;

  constructor(input: SimIamAccessDeniedInput) {
    const callerIdentifier = new SimIamCallerIdentifier().format(
      input.principal,
    );
    const reason = input.reason === undefined ? "" : ` ${input.reason}`;

    super(
      `User: ${callerIdentifier} is not authorized to perform: ${input.action} on resource: ${input.resource}${reason}`,
      { httpStatusCode: 400 },
    );

    this.caller = input.principal;
    this.action = input.action;
    this.resource = input.resource;
  }
}

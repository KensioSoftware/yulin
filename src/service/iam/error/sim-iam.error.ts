import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import { SimIamCallerIdentifier } from "./sim-iam-caller-identifier.js";

/**
 * Minimal metadata shape for simulated IAM errors.
 */
export interface SimIamErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated IAM errors.
 */
export class SimIamError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimIamErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Details of an IAM authorization failure.
 */
export interface SimIamAccessDeniedInput {
  readonly caller: SimAwsPrincipal;
  readonly action: string;
  readonly resource: string;
}

/**
 * Simulated IAM AccessDenied error.
 */
export class SimIamAccessDenied extends SimIamError {
  public override readonly name = "AccessDenied";

  public readonly caller: SimAwsPrincipal;
  public readonly action: string;
  public readonly resource: string;

  /**
   * Build an AWS-style authorization failure.
   *
   * Caller formatting is delegated because principal variants store their
   * identifiers differently. This class remains responsible for the IAM error
   * contract: message structure, HTTP metadata, and diagnostic properties.
   */
  constructor(input: SimIamAccessDeniedInput) {
    const callerIdentifier = new SimIamCallerIdentifier().format(input.caller);

    super(
      `User: ${callerIdentifier} is not authorized to perform: ${input.action} on resource: ${input.resource}`,
      { httpStatusCode: 403 },
    );

    this.caller = input.caller;
    this.action = input.action;
    this.resource = input.resource;
  }
}

/**
 * Simulated IAM NoSuchEntity error.
 */
export class SimIamNoSuchEntity extends SimIamError {
  public override readonly name = "NoSuchEntity";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated IAM EntityAlreadyExists error.
 */
export class SimIamEntityAlreadyExists extends SimIamError {
  public override readonly name = "EntityAlreadyExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Simulated IAM InvalidMarker error.
 */
export class SimIamInvalidMarkerException extends SimIamError {
  public override readonly name = "InvalidMarkerException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated IAM MalformedPolicyDocument error.
 */
export class SimIamMalformedPolicyDocument extends SimIamError {
  public override readonly name = "MalformedPolicyDocument";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

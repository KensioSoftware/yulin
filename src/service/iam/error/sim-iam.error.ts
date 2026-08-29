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
  readonly principal: SimAwsPrincipal;
  readonly action: string;
  readonly resource: string;

  /**
   * What else the message should say about why the request was denied.
   *
   * AWS names the source of a denial when it is something beyond the caller's
   * own permissions, such as a service control policy. A denial the caller's
   * identity and resource policies account for adds nothing here.
   */
  readonly reason?: string | undefined;
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
    const iamCallerIdentifier = new SimIamCallerIdentifier();
    const callerIdentifier = iamCallerIdentifier.format(input.principal);

    const reason = input.reason === undefined ? "" : ` ${input.reason}`;

    super(
      `User: ${callerIdentifier} is not authorized to perform: ${input.action} on resource: ${input.resource}${reason}`,
      { httpStatusCode: 403 },
    );

    this.caller = input.principal;
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
 * Simulated IAM DeleteConflict error.
 *
 * Real IAM refuses to delete an entity something still depends on, which is
 * how a Role with policies on it and a managed policy that is still attached
 * are both refused. The caller detaches first and deletes after.
 */
export class SimIamDeleteConflict extends SimIamError {
  public override readonly name = "DeleteConflict";

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

/**
 * Simulated IAM LimitExceeded error.
 *
 * IAM answers a request that would take the account past one of its quotas
 * with this, such as a policy document longer than the limit for where it is
 * going.
 */
export class SimIamLimitExceeded extends SimIamError {
  public override readonly name = "LimitExceeded";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

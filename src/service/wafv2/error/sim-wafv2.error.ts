/**
 * Minimal metadata shape for simulated WAFv2 errors.
 */
export interface SimWafErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated WAFv2 errors.
 */
export class SimWafError extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimWafErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated WAFv2 WAFInvalidParameterException error.
 *
 * WAFv2 reports input it will not accept this way, from a missing name to two
 * rules claiming one priority.
 */
export class SimWafInvalidParameterException extends SimWafError {
  public override readonly name = "WAFInvalidParameterException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated WAFv2 WAFNonexistentItemException error.
 *
 * Reading, changing or deleting a web ACL, IP set or regex pattern set that is
 * not there produces this, and so does a rule naming a regex pattern set that
 * does not exist.
 */
export class SimWafNonexistentItemException extends SimWafError {
  public override readonly name = "WAFNonexistentItemException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated WAFv2 WAFDuplicateItemException error.
 *
 * Names are unique within one scope, so creating a second web ACL under a name
 * that is taken fails rather than answering with the one that exists.
 */
export class SimWafDuplicateItemException extends SimWafError {
  public override readonly name = "WAFDuplicateItemException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated WAFv2 WAFOptimisticLockException error.
 *
 * Every WAFv2 resource carries a lock token that changes with each write, and
 * a change made against a stale one is refused. That is how the API stops two
 * callers overwriting each other's rules, and it is worth reproducing: code
 * that keeps a token from an earlier read fails here the way it fails on AWS.
 */
export class SimWafOptimisticLockException extends SimWafError {
  public override readonly name = "WAFOptimisticLockException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Request input that real WAFv2 takes and this simulation does not.
 *
 * Held apart from a validation failure because the two mean different things:
 * one says the request is wrong, and this one says the request is right and
 * the simulator does not go that far. A web ACL that accepted a rule it cannot
 * evaluate would allow a request AWS blocks, and a silent hole in a security
 * layer is worse than a missing one.
 */
export class SimWafUnsimulatedInputException extends SimWafError {
  public override readonly name = "UnsimulatedInputException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated WAFv2 WAFUnavailableEntityException error.
 *
 * An association names the resource a web ACL goes in front of, and WAFv2
 * reports a resource it cannot reach this way. Here that is a REST API stage
 * this simulation has never held.
 */
export class SimWafUnavailableEntityException extends SimWafError {
  public override readonly name = "WAFUnavailableEntityException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated WAFv2 WAFAssociatedItemException error.
 *
 * A web ACL in front of something cannot be deleted. Removing one that a stage
 * still points at would leave the stage protected by rules nothing holds any
 * more, so the association is disassociated first.
 */
export class SimWafAssociatedItemException extends SimWafError {
  public override readonly name = "WAFAssociatedItemException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

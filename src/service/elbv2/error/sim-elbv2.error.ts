/**
 * Minimal metadata shape for simulated Elastic Load Balancing v2 errors.
 */
export interface SimElbV2ErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated Elastic Load Balancing v2 errors.
 */
export class SimElbV2Error extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimElbV2ErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated ELBv2 AccessDeniedException.
 */
export class SimElbV2AccessDeniedException extends SimElbV2Error {
  public override readonly name = "AccessDeniedException";

  constructor(message: string) {
    super(message, { httpStatusCode: 403 });
  }
}

/**
 * Simulated ELBv2 ValidationError.
 *
 * This is what request input ELBv2 will not take produces, such as a load
 * balancer name outside the allowed characters or a rule priority out of range.
 */
export class SimElbV2ValidationError extends SimElbV2Error {
  public override readonly name = "ValidationError";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ELBv2 LoadBalancerNotFoundException.
 */
export class SimElbV2LoadBalancerNotFoundException extends SimElbV2Error {
  public override readonly name = "LoadBalancerNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ELBv2 TargetGroupNotFoundException.
 */
export class SimElbV2TargetGroupNotFoundException extends SimElbV2Error {
  public override readonly name = "TargetGroupNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ELBv2 ListenerNotFoundException.
 */
export class SimElbV2ListenerNotFoundException extends SimElbV2Error {
  public override readonly name = "ListenerNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ELBv2 RuleNotFoundException.
 */
export class SimElbV2RuleNotFoundException extends SimElbV2Error {
  public override readonly name = "RuleNotFoundException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ELBv2 DuplicateLoadBalancerNameException.
 */
export class SimElbV2DuplicateLoadBalancerNameException extends SimElbV2Error {
  public override readonly name = "DuplicateLoadBalancerNameException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ELBv2 DuplicateTargetGroupNameException.
 */
export class SimElbV2DuplicateTargetGroupNameException extends SimElbV2Error {
  public override readonly name = "DuplicateTargetGroupNameException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ELBv2 DuplicateListenerException.
 *
 * Two listeners on one load balancer cannot hold the same port.
 */
export class SimElbV2DuplicateListenerException extends SimElbV2Error {
  public override readonly name = "DuplicateListenerException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ELBv2 PriorityInUseException.
 *
 * Two rules on one listener cannot claim the same priority.
 */
export class SimElbV2PriorityInUseException extends SimElbV2Error {
  public override readonly name = "PriorityInUseException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ELBv2 InvalidTargetException.
 *
 * A target the target group's type will not take, such as a function ARN in an
 * `ip` group or an address in a `lambda` one.
 */
export class SimElbV2InvalidTargetException extends SimElbV2Error {
  public override readonly name = "InvalidTargetException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ELBv2 TooManyTargetsException.
 *
 * A `lambda` target group holds one target, which is what real ELB allows.
 */
export class SimElbV2TooManyTargetsException extends SimElbV2Error {
  public override readonly name = "TooManyTargetsException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ELBv2 ResourceInUseException.
 *
 * A target group a listener or rule still forwards to cannot be deleted.
 */
export class SimElbV2ResourceInUseException extends SimElbV2Error {
  public override readonly name = "ResourceInUseException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated ELBv2 InvalidConfigurationRequestException.
 *
 * A request whose parts contradict each other, such as a `lambda` target group
 * given a port, or an HTTPS listener with no certificate.
 */
export class SimElbV2InvalidConfigurationRequestException extends SimElbV2Error {
  public override readonly name = "InvalidConfigurationRequestException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Request input that real ELBv2 takes and this simulation does not.
 *
 * Held apart from a validation failure because the two mean different things:
 * one says the request is wrong, and this one says the request is right and the
 * simulator does not go that far. Accepting the input instead would leave a
 * load balancer looking configured to whoever sent it and unconfigured to
 * everything else.
 */
export class SimElbV2UnsimulatedInputException extends SimElbV2Error {
  public override readonly name = "UnsimulatedInputException";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Base class for simulated AWS SDK errors.
 */
export class SimSdkError extends Error {}

/**
 * The intercepted client is not usable for simulated AWS SDK routing.
 */
export class SimSdkInvalidClientError extends SimSdkError {
  public override readonly name = "SimSdkInvalidClientError";
}

/**
 * The intercepted client belongs to an AWS service without simulated AWS SDK
 * interception support.
 */
export class SimSdkUnknownServiceError extends SimSdkError {
  public override readonly name = "SimSdkUnknownServiceError";
}

/**
 * The intercepted SDK Command is not supported by the simulated AWS service.
 */
export class SimSdkUnsupportedCommandError extends SimSdkError {
  public override readonly name = "SimSdkUnsupportedCommandError";
}

/**
 * The SDK Command is excluded by an interception's Command allow list.
 */
export class SimSdkCommandNotInterceptedError extends SimSdkError {
  public override readonly name = "SimSdkCommandNotInterceptedError";
}

/**
 * The SDK client instance or client class is already intercepted.
 *
 * Multiple simultaneous interceptions of the same client could only ever be
 * confusing, so the existing interception must be restored first.
 */
export class SimSdkAlreadyInterceptedError extends SimSdkError {
  public override readonly name = "SimSdkAlreadyInterceptedError";
}

/**
 * The intercepted SDK client send was called with an unsupported callback
 * argument.
 */
export class SimSdkCallbackNotSupportedError extends SimSdkError {
  public override readonly name = "SimSdkCallbackNotSupportedError";
}

/**
 * A serialized AWS API request cannot be routed into the simulation.
 *
 * Raised for a request from an SDK bundled into the code it runs, where there
 * is no Command object left to intercept and the request itself is all there
 * is to route.
 */
export class SimSdkUnbridgedWireRequestError extends SimSdkError {
  public override readonly name = "SimSdkUnbridgedWireRequestError";
}

/**
 * A simulated SDK stream body was consumed more than once.
 */
export class SimSdkStreamAlreadyConsumedError extends SimSdkError {
  public override readonly name = "SimSdkStreamAlreadyConsumedError";
}

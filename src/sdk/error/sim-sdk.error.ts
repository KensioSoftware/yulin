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
 * The intercepted SDK client send was called with an unsupported callback
 * argument.
 */
export class SimSdkCallbackNotSupportedError extends SimSdkError {
  public override readonly name = "SimSdkCallbackNotSupportedError";
}

/**
 * A simulated SDK stream body was consumed more than once.
 */
export class SimSdkStreamAlreadyConsumedError extends SimSdkError {
  public override readonly name = "SimSdkStreamAlreadyConsumedError";
}

/**
 * The event a `TOKEN` authorizer's function is invoked with.
 *
 * A `TOKEN` authorizer sees three things and no more: that it is a `TOKEN`
 * authorizer, the value the request carried at its identity source, and the
 * ARN of the method being called. It never sees the rest of the request, which
 * is the whole difference between this and a `REQUEST` authorizer.
 */
export interface SimRestApiTokenAuthorizerEvent {
  type: "TOKEN";
  /** The value the request carried at the authorizer's identity source. */
  authorizationToken: string;
  /**
   * The `execute-api` ARN of the request being authorized. The policy the
   * function answers with is evaluated against this same ARN.
   */
  methodArn: string;
}

/**
 * Build the event a `TOKEN` authorizer is invoked with.
 */
export function simRestApiTokenAuthorizerEvent(
  authorizationToken: string,
  methodArn: string,
): SimRestApiTokenAuthorizerEvent {
  return { type: "TOKEN", authorizationToken, methodArn };
}

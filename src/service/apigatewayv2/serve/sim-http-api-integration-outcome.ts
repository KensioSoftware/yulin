/**
 * What invoking an integration produced, beyond the response the client gets.
 *
 * The two statuses are the pair AWS distinguishes in its access log variables.
 * `lambdaInvokeStatus` is Lambda's own answer to the invocation, and
 * `integrationStatus` the status the handler's code returned. An invocation
 * that never reached a handler has neither.
 */
export interface SimHttpApiIntegrationOutcome {
  readonly response: Response;
  readonly integrationStatus?: number | undefined;
  readonly lambdaInvokeStatus?: number | undefined;
  readonly integrationErrorMessage?: string | undefined;
}

/**
 * The 500 every way of failing to reach a handler produces, carrying the
 * reason the access log reports as `$context.integrationErrorMessage`.
 *
 * The message never reaches the client. Real API Gateway answers the same
 * body whatever went wrong, and leaves the reason in its own logs.
 */
export function simHttpApiIntegrationFailure(
  response: Response,
  error: unknown,
): SimHttpApiIntegrationOutcome {
  return {
    response,
    integrationErrorMessage:
      error instanceof Error ? error.message : String(error),
  };
}

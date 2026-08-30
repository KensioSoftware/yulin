import { SimCognitoTooManyRequestsException } from "../error/sim-cognito-throttle.error.js";
import type { SimCognitoThrottledOperation } from "../user-pool/auth/sim-cognito-request-throttle.js";
import type { SimCognitoCountedScope } from "./sim-cognito-counted-request.js";
import type { SimCognitoPoolMetrics } from "./sim-cognito-pool-metrics.js";

/**
 * Turn a request away where the pool has been told to, and run it otherwise.
 *
 * The refusal is counted here, and the `*Successes` beside it is counted by
 * the caller that wrapped this, because real Cognito counts a throttled
 * request as an unsuccessful one as well as a throttled one.
 */
export async function throttledSimCognitoRequest<T>(
  metrics: SimCognitoPoolMetrics,
  operation: SimCognitoThrottledOperation,
  scope: SimCognitoCountedScope,
  run: () => Promise<T>,
): Promise<T> {
  if (!scope.pool.auth.throttle.takesOne(operation)) {
    return await run();
  }

  metrics.throttled(operation, scope.pool.id, scope.client.id);

  throw new SimCognitoTooManyRequestsException(
    `Rate exceeded for ${operation} on user pool ${scope.pool.id}.`,
  );
}

import type {
  SimCognitoPoolMetrics,
  SimCognitoRequestMetric,
} from "./sim-cognito-pool-metrics.js";

/**
 * What an authentication request answers with, as the count reads it.
 */
interface SimCognitoAuthenticationOutcome {
  readonly AuthenticationResult?: unknown;
}

/**
 * The pool and app client a counted request ran against.
 *
 * The client id is a string rather than a client, because a request an
 * administrator made reaches the pool through no app client and is reported
 * under a fixed name instead.
 */
interface SimCognitoCountedScope {
  readonly pool: { readonly id: string };
  readonly client: { readonly id: string };
}

/**
 * Run a request and count whether it issued tokens.
 *
 * A request the pool refused counts as a 0 rather than going uncounted, which
 * is what makes `Average` over the metric a success rate. The failure itself
 * still reaches the caller.
 */
async function countedSimCognitoRequest<T>(
  metrics: SimCognitoPoolMetrics,
  metricName: SimCognitoRequestMetric,
  scope: SimCognitoCountedScope,
  run: () => Promise<T>,
  succeeded: (output: T) => boolean,
): Promise<T> {
  let counted = false;

  try {
    const output = await run();

    counted = succeeded(output);

    return output;
  } finally {
    metrics.count(metricName, scope.pool.id, scope.client.id, counted);
  }
}

/**
 * Run an authentication request and count whether it issued tokens.
 *
 * Real Cognito counts a sign-in successful once tokens have been issued, so a
 * request answered with a challenge counts as a 0 and the response that
 * finishes it counts as a 1.
 */
export async function countedSimCognitoAuth<
  T extends SimCognitoAuthenticationOutcome,
>(
  metrics: SimCognitoPoolMetrics,
  metricName: SimCognitoRequestMetric,
  scope: SimCognitoCountedScope,
  run: () => Promise<T>,
): Promise<T> {
  return await countedSimCognitoRequest(
    metrics,
    metricName,
    scope,
    run,
    (output) => output.AuthenticationResult !== undefined,
  );
}

/**
 * Run a request that hands back no session and count whether it finished.
 *
 * A registration answers with a user rather than with tokens, so finishing is
 * the whole of what makes one a success.
 */
export async function countedSimCognitoCompletion<T>(
  metrics: SimCognitoPoolMetrics,
  metricName: SimCognitoRequestMetric,
  scope: SimCognitoCountedScope,
  run: () => Promise<T>,
): Promise<T> {
  return await countedSimCognitoRequest(
    metrics,
    metricName,
    scope,
    run,
    () => true,
  );
}

/**
 * Run a token grant and count it as a federation where it is one.
 *
 * A code from an identity provider becomes a `FederationSuccesses` at the
 * tokens it is exchanged for. A code from the pool's own sign-in form is not a
 * federation and counts nothing here.
 */
export async function countedSimCognitoFederation<T>(
  metrics: SimCognitoPoolMetrics,
  scope: SimCognitoCountedScope,
  federated: boolean,
  run: () => Promise<T>,
): Promise<T> {
  if (!federated) {
    return await run();
  }

  return await countedSimCognitoCompletion(
    metrics,
    "FederationSuccesses",
    scope,
    run,
  );
}

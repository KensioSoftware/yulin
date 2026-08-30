import type { SimCloudWatchServiceWriter } from "../../cloudwatch/write/sim-cloudwatch-service-writer.js";
import type { SimCognitoThrottledOperation } from "../user-pool/auth/sim-cognito-request-throttle.js";
import {
  simCognitoMetricNamespace,
  simCognitoPoolDimensions,
} from "./sim-cognito-metrics.js";

interface SimCognitoPoolMetricsProperties {
  readonly metrics: SimCloudWatchServiceWriter | undefined;
}

/**
 * What a simulated user pool publishes about the requests it handles.
 *
 * Real Cognito publishes these without being asked and without a caller
 * needing any permission, so they go in through simulated CloudWatch's service
 * writer rather than through `PutMetricData`, which refuses the `AWS/Cognito`
 * namespace exactly as an account does.
 *
 * A pool built on its own, outside a `SimAws` instance, has no CloudWatch to
 * publish into and counts nothing.
 */
export class SimCognitoPoolMetrics {
  readonly #metrics: SimCloudWatchServiceWriter | undefined;

  constructor(properties: SimCognitoPoolMetricsProperties) {
    this.#metrics = properties.metrics;
  }

  /**
   * Count one request against the pool and app client that made it.
   *
   * Real Cognito publishes a `*Successes` on every request of the kind, as a 1
   * where it issued tokens and a 0 where it did not, so `Average` over one is
   * a success rate and `SampleCount` is the number of requests. A request that
   * was refused before the pool was known counts nothing, because there is no
   * `UserPool` to report it under.
   */
  count(
    operation: SimCognitoThrottledOperation,
    poolId: string,
    clientId: string,
    issuedTokens: boolean,
  ): void {
    this.publish(
      `${operation}Successes`,
      poolId,
      clientId,
      issuedTokens ? 1 : 0,
    );
  }

  /**
   * Count one request the pool turned away for rate limiting.
   *
   * Real Cognito counts a throttled request in both places. It is a 1 here and
   * a 0 in the `*Successes` beside it, because a request that was turned away
   * issued no tokens.
   */
  throttled(
    operation: SimCognitoThrottledOperation,
    poolId: string,
    clientId: string,
  ): void {
    this.publish(`${operation}Throttles`, poolId, clientId, 1);
  }

  private publish(
    metricName: string,
    poolId: string,
    clientId: string,
    value: number,
  ): void {
    this.#metrics?.publish([
      {
        namespace: simCognitoMetricNamespace,
        metricName,
        dimensions: simCognitoPoolDimensions(poolId, clientId),
        value,
        unit: "Count",
      },
    ]);
  }
}

import type { SimCloudWatchServiceWriter } from "../../cloudwatch/write/sim-cloudwatch-service-writer.js";
import {
  simCognitoMetricNamespace,
  simCognitoPoolDimensions,
} from "./sim-cognito-metrics.js";

/**
 * The counts real Cognito keeps of what a pool was asked to do.
 *
 * Each is published on every request of its kind, as a 1 where the request
 * issued tokens and a 0 where it did not. `Average` over one is therefore a
 * success rate and `SampleCount` is the number of requests, which is how the
 * AWS documentation says to read them.
 */
export type SimCognitoRequestMetric =
  | "SignInSuccesses"
  | "SignUpSuccesses"
  | "TokenRefreshSuccesses"
  | "FederationSuccesses";

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
   * A request that was refused before the pool was known counts nothing,
   * because there is no `UserPool` to report it under.
   */
  count(
    metricName: SimCognitoRequestMetric,
    poolId: string,
    clientId: string,
    issuedTokens: boolean,
  ): void {
    this.#metrics?.publish([
      {
        namespace: simCognitoMetricNamespace,
        metricName,
        dimensions: simCognitoPoolDimensions(poolId, clientId),
        value: issuedTokens ? 1 : 0,
        unit: "Count",
      },
    ]);
  }
}

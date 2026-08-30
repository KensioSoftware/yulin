import type { SimClock } from "../../../util/clock/sim-clock.js";
import type {
  SimCloudWatchServiceDatum,
  SimCloudWatchServiceWriter,
} from "../../cloudwatch/write/sim-cloudwatch-service-writer.js";

/**
 * The namespace real Lambda publishes what it counts about a function under.
 */
export const simLambdaMetricNamespace = "AWS/Lambda";

/**
 * How one invocation went, as the metrics read it.
 */
export interface SimLambdaInvocationOutcome {
  readonly functionName: string;

  /** How far the simulation's clock moved while the handler ran. */
  readonly durationMilliseconds: number;

  /** Whether the handler threw, which is what real Lambda counts an error. */
  readonly failed: boolean;
}

interface SimLambdaInvocationMetricsProperties {
  readonly metrics: SimCloudWatchServiceWriter | undefined;
  readonly clock: SimClock;
}

/**
 * What a simulated Lambda function publishes about its own invocations.
 *
 * Real Lambda publishes these without being asked and without a caller needing
 * any permission, so they go in through simulated CloudWatch's service writer
 * rather than through `PutMetricData`, which refuses the `AWS/Lambda`
 * namespace exactly as an account does.
 *
 * A function built on its own, outside a `SimAws` instance, has no CloudWatch
 * to publish into and counts nothing.
 */
export class SimLambdaInvocationMetrics {
  readonly #metrics: SimCloudWatchServiceWriter | undefined;
  readonly #clock: SimClock;

  constructor(properties: SimLambdaInvocationMetricsProperties) {
    this.#metrics = properties.metrics;
    this.#clock = properties.clock;
  }

  /**
   * Run one invocation and count how it went.
   *
   * `Invocations` counts every invocation, including one that failed, which is
   * how real Lambda counts them. `Errors` counts the ones that threw, so an
   * alarm reading one against the other gets a failure rate.
   *
   * The duration is measured on the simulation's clock rather than the host's,
   * so it is a number a test can assert on. A handler that moves the clock
   * reports the time it moved, and one that does not reports nothing spent.
   */
  async around<T>(functionName: string, run: () => Promise<T>): Promise<T> {
    const startedAt = this.#clock.now().getTime();
    let failed = true;

    try {
      const result = await run();

      failed = false;

      return result;
    } finally {
      this.#metrics?.publish(
        invocationData({
          functionName,
          durationMilliseconds: this.#clock.now().getTime() - startedAt,
          failed,
        }),
      );
    }
  }
}

/**
 * The datapoints one finished invocation produced.
 */
function invocationData(
  outcome: SimLambdaInvocationOutcome,
): readonly SimCloudWatchServiceDatum[] {
  const dimensions = [{ name: "FunctionName", value: outcome.functionName }];
  const data: SimCloudWatchServiceDatum[] = [
    {
      namespace: simLambdaMetricNamespace,
      metricName: "Invocations",
      dimensions,
      value: 1,
      unit: "Count",
    },
    {
      namespace: simLambdaMetricNamespace,
      metricName: "Duration",
      dimensions,
      value: outcome.durationMilliseconds,
      unit: "Milliseconds",
    },
  ];

  if (outcome.failed) {
    data.push({
      namespace: simLambdaMetricNamespace,
      metricName: "Errors",
      dimensions,
      value: 1,
      unit: "Count",
    });
  }

  return data;
}

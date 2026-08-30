import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimCloudWatchServiceWriter } from "../../cloudwatch/write/sim-cloudwatch-service-writer.js";
import {
  simLambdaFunctionDimensions,
  simLambdaMetricNamespace,
} from "./sim-lambda-metrics.js";

interface SimLambdaIteratorAgeProperties {
  readonly metrics: SimCloudWatchServiceWriter | undefined;
  readonly clock: SimClock;
}

/**
 * How far behind its stream a finished batch left a function.
 *
 * Real Lambda publishes `IteratorAge` when a function finishes processing a
 * batch of stream records, as the distance between the newest record in the
 * batch and the moment the batch finished. A batch that failed is counted too,
 * because the retry leaves the function further behind rather than caught up.
 *
 * The age is measured on the simulation's clock, so a test that lets records
 * age before anything reads them gets back the interval it let pass.
 */
export class SimLambdaIteratorAge {
  readonly #metrics: SimCloudWatchServiceWriter | undefined;
  readonly #clock: SimClock;

  constructor(properties: SimLambdaIteratorAgeProperties) {
    this.#metrics = properties.metrics;
    this.#clock = properties.clock;
  }

  /**
   * Count one finished batch.
   *
   * A batch whose records carry no creation time is left uncounted, because
   * there is nothing to measure the age from.
   */
  count(functionName: string, newestRecordAt: Date | undefined): void {
    if (newestRecordAt === undefined) {
      return;
    }

    const age = this.#clock.now().getTime() - newestRecordAt.getTime();

    this.#metrics?.publish([
      {
        namespace: simLambdaMetricNamespace,
        metricName: "IteratorAge",
        dimensions: simLambdaFunctionDimensions(functionName),
        value: Math.max(0, age),
        unit: "Milliseconds",
      },
    ]);
  }
}

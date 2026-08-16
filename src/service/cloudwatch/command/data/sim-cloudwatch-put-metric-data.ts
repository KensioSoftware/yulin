import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  SimCloudWatchInvalidParameterValueException,
  SimCloudWatchMissingRequiredParameterException,
} from "../../error/sim-cloudwatch.error.js";
import { requiredSimCloudWatchDimensions } from "../../metric/sim-cloudwatch-dimension.js";
import type { SimCloudWatchMetricStore } from "../../metric/sim-cloudwatch-metric-store.js";
import { requiredSimCloudWatchName } from "../../metric/sim-cloudwatch-name.js";
import { requiredSimCloudWatchWritableNamespace } from "../../metric/sim-cloudwatch-namespace.js";
import type { SimCloudWatchAuthorizer } from "../authorize/sim-cloudwatch-authorizer.js";
import type { SimCloudWatchRequestOptions } from "../sim-cloudwatch-request-options.js";
import type {
  SimPutMetricDataCommand,
  SimPutMetricDataCommandOutput,
} from "./data.command.js";
import { readSimCloudWatchDatapoint } from "./sim-cloudwatch-metric-datum.js";

const putMetricDataAction = "cloudwatch:PutMetricData";

/**
 * How many metric data entries real CloudWatch takes in one request.
 */
const maximumMetricData = 1000;

interface SimCloudWatchPutMetricDataProperties {
  readonly metrics: SimCloudWatchMetricStore;
  readonly authorizer: SimCloudWatchAuthorizer;
  readonly clock: SimClock;
}

/**
 * The command that records custom metric data.
 *
 * A datum carrying no timestamp is stamped from the simulation's clock rather
 * than the host's, so a test with a frozen or advanced clock gets timestamps it
 * can assert on exactly, and one that moves time on gets datapoints in the
 * period it moved to.
 */
export class SimCloudWatchPutMetricData {
  readonly #metrics: SimCloudWatchMetricStore;
  readonly #authorizer: SimCloudWatchAuthorizer;
  readonly #clock: SimClock;

  constructor(properties: SimCloudWatchPutMetricDataProperties) {
    this.#metrics = properties.metrics;
    this.#authorizer = properties.authorizer;
    this.#clock = properties.clock;
  }

  /**
   * Record every datum in a request against the metric it names.
   */
  handle(
    command: SimPutMetricDataCommand,
    options?: SimCloudWatchRequestOptions,
  ): SimPutMetricDataCommandOutput {
    // The namespace is read first because authorization is conditioned on it,
    // and authorization comes before the rest of the input is read, because
    // real IAM decides a request before the service handles it.
    const namespace = requiredSimCloudWatchWritableNamespace(
      command.input.Namespace,
    );

    this.#authorizer.authorizeNamespace(
      putMetricDataAction,
      namespace,
      options?.caller,
    );

    const data = requiredMetricData(command.input.MetricData);
    const now = this.#clock.now();

    // Every datum is read before any of them is stored, so a request holding
    // one the simulator refuses records none of the others. Real CloudWatch
    // validates the whole request the same way.
    const recordings = data.map((datum) => ({
      identity: {
        namespace,
        metricName: requiredSimCloudWatchName("MetricName", datum.MetricName),
        dimensions: requiredSimCloudWatchDimensions(datum.Dimensions),
      },
      datapoint: readSimCloudWatchDatapoint(datum, now),
    }));

    for (const recording of recordings) {
      this.#metrics.ensure(recording.identity).record(recording.datapoint);
    }

    return { $metadata: {} };
  }
}

function requiredMetricData<T>(data: readonly T[] | undefined): readonly T[] {
  if (data === undefined || data.length === 0) {
    throw new SimCloudWatchMissingRequiredParameterException(
      "The parameter MetricData must be present and not empty.",
    );
  }

  if (data.length > maximumMetricData) {
    throw new SimCloudWatchInvalidParameterValueException(
      `The parameter MetricData must hold at most ${maximumMetricData} ` +
        `entries, and ${data.length} were given.`,
    );
  }

  return data;
}

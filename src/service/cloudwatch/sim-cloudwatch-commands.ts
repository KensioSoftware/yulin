import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimCloudWatchAuthorizer } from "./command/authorize/sim-cloudwatch-authorizer.js";
import { SimCloudWatchPutMetricData } from "./command/data/sim-cloudwatch-put-metric-data.js";
import { SimCloudWatchGetMetricData } from "./command/query/sim-cloudwatch-get-metric-data.js";
import { SimCloudWatchGetMetricStatistics } from "./command/query/sim-cloudwatch-get-metric-statistics.js";
import { SimCloudWatchListMetrics } from "./command/query/sim-cloudwatch-list-metrics.js";
import { SimCloudWatchMetricStore } from "./metric/sim-cloudwatch-metric-store.js";

export interface SimCloudWatchProperties {
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * The collaborators one simulated CloudWatch scope is built from.
 *
 * Held apart from SimCloudWatch for the same reason simulated CloudWatch Logs
 * holds its own: the facade is one method per SDK Command and grows by one with
 * every operation added, so the wiring deciding what those methods delegate to
 * needs somewhere it is not competing for room with them.
 */
export class SimCloudWatchCommands {
  readonly metrics: SimCloudWatchMetricStore;
  readonly putMetricData: SimCloudWatchPutMetricData;
  readonly listMetrics: SimCloudWatchListMetrics;
  readonly getMetricStatistics: SimCloudWatchGetMetricStatistics;
  readonly getMetricData: SimCloudWatchGetMetricData;
  readonly background: BackgroundScheduler;

  constructor(properties: SimCloudWatchProperties = {}) {
    const {
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const authorizer = new SimCloudWatchAuthorizer({ iam });
    const metrics = new SimCloudWatchMetricStore();

    this.background = background;
    this.metrics = metrics;
    this.putMetricData = new SimCloudWatchPutMetricData({
      metrics,
      authorizer,
      clock: background,
    });
    this.listMetrics = new SimCloudWatchListMetrics({
      metrics,
      authorizer,
      clock: background,
    });
    this.getMetricStatistics = new SimCloudWatchGetMetricStatistics({
      metrics,
      authorizer,
    });
    this.getMetricData = new SimCloudWatchGetMetricData({
      metrics,
      authorizer,
    });
  }
}

import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import { SimCloudWatchAlarmActions } from "./alarm/action/sim-cloudwatch-alarm-actions.js";
import {
  SimCloudWatchNoAlarmTargets,
  type SimCloudWatchAlarmTargets,
} from "./alarm/action/sim-cloudwatch-alarm-targets.js";
import { SimCloudWatchAlarmSchedule } from "./alarm/sim-cloudwatch-alarm-schedule.js";
import { SimCloudWatchAlarmStore } from "./alarm/sim-cloudwatch-alarm-store.js";
import { SimCloudWatchAlarmReads } from "./command/alarm/sim-cloudwatch-alarm-reads.js";
import { SimCloudWatchAlarmWrites } from "./command/alarm/sim-cloudwatch-alarm-writes.js";
import { SimCloudWatchSetAlarmState } from "./command/alarm/sim-cloudwatch-set-alarm-state.js";
import { SimCloudWatchAuthorizer } from "./command/authorize/sim-cloudwatch-authorizer.js";
import { SimCloudWatchPutMetricData } from "./command/data/sim-cloudwatch-put-metric-data.js";
import { SimCloudWatchGetMetricData } from "./command/query/sim-cloudwatch-get-metric-data.js";
import { SimCloudWatchGetMetricStatistics } from "./command/query/sim-cloudwatch-get-metric-statistics.js";
import { SimCloudWatchListMetrics } from "./command/query/sim-cloudwatch-list-metrics.js";
import { SimCloudWatchMetricStore } from "./metric/sim-cloudwatch-metric-store.js";

export interface SimCloudWatchProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;

  /**
   * Where an alarm's actions reach. A SimCloudWatch built on its own has no
   * other simulated services, so it holds alarms and notifies none of them.
   */
  readonly alarmTargets?: SimCloudWatchAlarmTargets;
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
  readonly alarms: SimCloudWatchAlarmStore;
  readonly alarmWrites: SimCloudWatchAlarmWrites;
  readonly alarmReads: SimCloudWatchAlarmReads;
  readonly setAlarmState: SimCloudWatchSetAlarmState;
  readonly alarmActions: SimCloudWatchAlarmActions;
  readonly background: BackgroundScheduler;

  constructor(properties: SimCloudWatchProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      background = new BackgroundTasks(),
      alarmTargets = new SimCloudWatchNoAlarmTargets(),
    } = properties;

    const iam = simIamInRegion(properties.iam, accountRegionScope.regionName);

    const authorizer = new SimCloudWatchAuthorizer({ iam, accountRegionScope });
    const metrics = new SimCloudWatchMetricStore();
    const alarms = new SimCloudWatchAlarmStore();
    const alarmActions = new SimCloudWatchAlarmActions({
      targets: alarmTargets,
      accountRegionScope,
    });
    const schedule = new SimCloudWatchAlarmSchedule({
      metrics,
      actions: alarmActions,
      background,
    });

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
    this.alarms = alarms;
    this.alarmActions = alarmActions;
    const alarmContext = {
      alarms,
      schedule,
      actions: alarmActions,
      authorizer,
      accountRegionScope,
      clock: background,
    };

    this.alarmWrites = new SimCloudWatchAlarmWrites(alarmContext);
    this.setAlarmState = new SimCloudWatchSetAlarmState(alarmContext);
    this.alarmReads = new SimCloudWatchAlarmReads(alarmContext);
  }
}

import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import { SimCloudWatchCfnResourceFactory } from "./cfn/sim-cloudwatch-cfn-resource-factory.js";
import type * as simCloudWatchCommands from "./command/sim-cloudwatch-command.types.js";
import type { SimCloudWatchRequestOptions } from "./command/sim-cloudwatch-request-options.js";
import type { SimCloudWatchAlarmActionFailure } from "./alarm/action/sim-cloudwatch-alarm-action-failures.js";
import type { SimCloudWatchAlarm } from "./alarm/sim-cloudwatch-alarm.js";
import type { SimCloudWatchMetric } from "./metric/sim-cloudwatch-metric.js";
import { SimCloudWatchSdkCommandRouter } from "./sdk/sim-cloudwatch-sdk-command-router.js";
import type { SimCloudWatchServiceWriter } from "./write/sim-cloudwatch-service-writer.js";
import {
  SimCloudWatchCommands,
  type SimCloudWatchProperties,
} from "./sim-cloudwatch-commands.js";

/**
 * Simulated CloudWatch metrics. Handles SDK commands. Emulates AWS behaviour
 * and state.
 *
 * Metrics are scoped to an account and region, as they are on real AWS: a
 * metric published in one region is invisible from another, and there is no
 * ARN to reach one across the boundary.
 *
 * Only custom metrics live here. Nothing in this simulation publishes into the
 * `AWS/` namespaces, so a query for `AWS/Lambda` `Invocations` finds nothing
 * rather than a number that was never measured.
 */
export class SimCloudWatch {
  readonly #commands: SimCloudWatchCommands;
  readonly #sdkRouter = new SimCloudWatchSdkCommandRouter(this);
  readonly #cfnFactory = new SimCloudWatchCfnResourceFactory({
    cloudWatch: this,
  });

  constructor(properties: SimCloudWatchProperties = {}) {
    this.#commands = new SimCloudWatchCommands(properties);
  }

  /**
   * Every metric in this scope, in the order each was first written to.
   *
   * This is the simulator's own accessor, for tests inspecting metric state
   * without going through a Command and its authorization.
   */
  allMetrics(): readonly SimCloudWatchMetric[] {
    return this.#commands.metrics.all;
  }

  /**
   * How the rest of the simulation publishes the metrics AWS publishes.
   *
   * A simulated service counting its own work reaches the metric store through
   * here rather than through `PutMetricData`, which refuses a reserved `AWS/`
   * namespace exactly as an account does.
   */
  serviceWriter(): SimCloudWatchServiceWriter {
    return this.#commands.serviceWriter;
  }

  /**
   * Every alarm in this scope, in the order each was created.
   *
   * This is the simulator's own accessor, for tests inspecting alarm state
   * without going through a Command and its authorization.
   */
  allAlarms(): readonly SimCloudWatchAlarm[] {
    return this.#commands.alarms.all;
  }

  /**
   * Find an alarm by name.
   *
   * This is the simulator's own accessor, for tests inspecting one alarm
   * without going through a Command and its authorization.
   */
  findAlarm(alarmName: string): SimCloudWatchAlarm | undefined {
    return this.#commands.alarms.find(alarmName);
  }

  /**
   * Every alarm notification this scope could not send.
   *
   * A failed action is invisible on real CloudWatch: the alarm changes state
   * either way and nothing reports the failure. Keeping it is what lets a test
   * find out that the alarm it set up reached nothing.
   */
  get alarmActionFailures(): readonly SimCloudWatchAlarmActionFailure[] {
    return this.#commands.alarmActions.failures.all;
  }

  /**
   * Handle a PutMetricData Command from the SDK.
   */
  async putMetricData(
    command: simCloudWatchCommands.SimPutMetricDataCommand,
    options?: SimCloudWatchRequestOptions,
  ): Promise<simCloudWatchCommands.SimPutMetricDataCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.putMetricData.handle(command, options);
  }

  /**
   * Handle a ListMetrics Command from the SDK.
   */
  async listMetrics(
    command: simCloudWatchCommands.SimListMetricsCommand,
    options?: SimCloudWatchRequestOptions,
  ): Promise<simCloudWatchCommands.SimListMetricsCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.listMetrics.handle(command, options);
  }

  /**
   * Handle a GetMetricStatistics Command from the SDK.
   */
  async getMetricStatistics(
    command: simCloudWatchCommands.SimGetMetricStatisticsCommand,
    options?: SimCloudWatchRequestOptions,
  ): Promise<simCloudWatchCommands.SimGetMetricStatisticsCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.getMetricStatistics.handle(command, options);
  }

  /**
   * Handle a GetMetricData Command from the SDK.
   */
  async getMetricData(
    command: simCloudWatchCommands.SimGetMetricDataCommand,
    options?: SimCloudWatchRequestOptions,
  ): Promise<simCloudWatchCommands.SimGetMetricDataCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.getMetricData.handle(command, options);
  }

  /**
   * Handle a PutMetricAlarm Command from the SDK.
   */
  async putMetricAlarm(
    command: simCloudWatchCommands.SimPutMetricAlarmCommand,
    options?: SimCloudWatchRequestOptions,
  ): Promise<simCloudWatchCommands.SimPutMetricAlarmCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.alarmWrites.putMetricAlarm(command, options);
  }

  /**
   * Handle a DescribeAlarms Command from the SDK.
   */
  async describeAlarms(
    command: simCloudWatchCommands.SimDescribeAlarmsCommand,
    options?: SimCloudWatchRequestOptions,
  ): Promise<simCloudWatchCommands.SimDescribeAlarmsCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.alarmReads.describeAlarms(command, options);
  }

  /**
   * Handle a DeleteAlarms Command from the SDK.
   */
  async deleteAlarms(
    command: simCloudWatchCommands.SimDeleteAlarmsCommand,
    options?: SimCloudWatchRequestOptions,
  ): Promise<simCloudWatchCommands.SimDeleteAlarmsCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.alarmWrites.deleteAlarms(command, options);
  }

  /**
   * Handle a SetAlarmState Command from the SDK.
   */
  async setAlarmState(
    command: simCloudWatchCommands.SimSetAlarmStateCommand,
    options?: SimCloudWatchRequestOptions,
  ): Promise<simCloudWatchCommands.SimSetAlarmStateCommandOutput> {
    await this.#commands.background.sequence();
    return await this.#commands.setAlarmState.handle(command, options);
  }

  /**
   * Handle a DescribeAlarmHistory Command from the SDK.
   */
  async describeAlarmHistory(
    command: simCloudWatchCommands.SimDescribeAlarmHistoryCommand,
    options?: SimCloudWatchRequestOptions,
  ): Promise<simCloudWatchCommands.SimDescribeAlarmHistoryCommandOutput> {
    await this.#commands.background.sequence();
    return this.#commands.alarmReads.describeAlarmHistory(command, options);
  }

  /**
   * Get the CloudFormation Resource factory for AWS::CloudWatch::* Resources.
   */
  cfnResourceFactory(): SimCloudWatchCfnResourceFactory {
    return this.#cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.#sdkRouter;
  }
}

import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type * as simCloudWatchCommands from "./command/sim-cloudwatch-command.types.js";
import type { SimCloudWatchRequestOptions } from "./command/sim-cloudwatch-request-options.js";
import type { SimCloudWatchMetric } from "./metric/sim-cloudwatch-metric.js";
import { SimCloudWatchSdkCommandRouter } from "./sdk/sim-cloudwatch-sdk-command-router.js";
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
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.#sdkRouter;
  }
}

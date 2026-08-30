import type * as simLogsCommands from "./command/sim-logs-command.types.js";
import type { SimLogsRequestOptions } from "./command/sim-logs-request-options.js";
import type { SimLogsMetricPublicationFailure } from "./metric/sim-logs-metric-fan-out.js";
import { SimLogsDeliveryOperations } from "./sim-logs-delivery-operations.js";
import type { SimLogsCommands } from "./sim-logs-commands.js";

/**
 * The metric commands of the simulated CloudWatch Logs facade.
 *
 * They sit here for the reason the delivery commands do. SimLogs grows by one
 * delegating method per simulated operation and is at the length this codebase
 * allows. These belong together as the half of CloudWatch Logs that turns what
 * is written into CloudWatch metrics.
 */
export abstract class SimLogsMetricOperations extends SimLogsDeliveryOperations {
  protected abstract override readonly commands: SimLogsCommands;

  /**
   * Every metric publication this scope could not make, whether a metric
   * filter or an embedded metric document asked for it.
   *
   * A failed publication is invisible in an account, where it becomes a metric
   * nobody is watching. Keeping it is what lets a test find out that the
   * metrics it set up never wrote a datapoint.
   */
  get metricPublicationFailures(): readonly SimLogsMetricPublicationFailure[] {
    return this.commands.metricFanOut.failures;
  }

  /** Handle a PutMetricFilter Command from the SDK. */
  async putMetricFilter(
    command: simLogsCommands.SimPutMetricFilterCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimPutMetricFilterCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.metricFilters.putMetricFilter(command, options);
  }

  /** Handle a DescribeMetricFilters Command from the SDK. */
  async describeMetricFilters(
    command: simLogsCommands.SimDescribeMetricFiltersCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDescribeMetricFiltersCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.metricFilters.describeMetricFilters(command, options);
  }

  /** Handle a DeleteMetricFilter Command from the SDK. */
  async deleteMetricFilter(
    command: simLogsCommands.SimDeleteMetricFilterCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDeleteMetricFilterCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.metricFilters.deleteMetricFilter(command, options);
  }
}

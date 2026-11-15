import type * as simLogsCommands from "./command/sim-logs-command.types.js";
import type { SimLogsRequestOptions } from "./command/sim-logs-request-options.js";
import type { SimLogsCommands } from "./sim-logs-commands.js";
import { SimLogsMetricOperations } from "./sim-logs-metric-operations.js";

/**
 * The tag commands of the simulated CloudWatch Logs facade.
 *
 * They sit here for the reason the delivery and metric commands do. SimLogs
 * grows by one delegating method per simulated operation and is at the
 * length this codebase allows.
 */
export abstract class SimLogsTagOperations extends SimLogsMetricOperations {
  protected abstract override readonly commands: SimLogsCommands;

  /** Handle a TagResource Command from the SDK. */
  async tagResource(
    command: simLogsCommands.SimLogsTagResourceCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimLogsTagResourceCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.tags.tagResource(command, options);
  }

  /** Handle an UntagResource Command from the SDK. */
  async untagResource(
    command: simLogsCommands.SimLogsUntagResourceCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimLogsUntagResourceCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.tags.untagResource(command, options);
  }

  /** Handle a ListTagsForResource Command from the SDK. */
  async listTagsForResource(
    command: simLogsCommands.SimLogsListTagsForResourceCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimLogsListTagsForResourceCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.tags.listTagsForResource(command, options);
  }
}

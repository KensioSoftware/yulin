import type * as simLogsCommands from "./command/sim-logs-command.types.js";
import type { SimLogsRequestOptions } from "./command/sim-logs-request-options.js";
import type { SimLogsCommands } from "./sim-logs-commands.js";
import { SimLogsDeliveryInspection } from "./sim-logs-delivery-inspection.js";

/**
 * The delivery commands of the simulated CloudWatch Logs facade.
 *
 * They sit here rather than on SimLogs itself because that file grows by one
 * delegating method per simulated operation and is at the length this codebase
 * allows. The nine belong together: they are the half of CloudWatch Logs that
 * sets up delivery from another service, and they share no state with the log
 * group operations at all.
 */
export abstract class SimLogsDeliveryOperations extends SimLogsDeliveryInspection {
  protected abstract override readonly commands: SimLogsCommands;

  /** Handle a PutDeliverySource Command from the SDK. */
  async putDeliverySource(
    command: simLogsCommands.SimPutDeliverySourceCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimPutDeliverySourceCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.deliverySources.putDeliverySource(command, options);
  }

  /** Handle a DescribeDeliverySources Command from the SDK. */
  async describeDeliverySources(
    command: simLogsCommands.SimDescribeDeliverySourcesCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDescribeDeliverySourcesCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.deliverySources.describeDeliverySources(
      command,
      options,
    );
  }

  /** Handle a DeleteDeliverySource Command from the SDK. */
  async deleteDeliverySource(
    command: simLogsCommands.SimDeleteDeliverySourceCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDeleteDeliverySourceCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.deliverySources.deleteDeliverySource(command, options);
  }

  /** Handle a PutDeliveryDestination Command from the SDK. */
  async putDeliveryDestination(
    command: simLogsCommands.SimPutDeliveryDestinationCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimPutDeliveryDestinationCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.deliveryDestinations.putDeliveryDestination(
      command,
      options,
    );
  }

  /** Handle a DescribeDeliveryDestinations Command from the SDK. */
  async describeDeliveryDestinations(
    command: simLogsCommands.SimDescribeDeliveryDestinationsCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDescribeDeliveryDestinationsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.deliveryDestinations.describeDeliveryDestinations(
      command,
      options,
    );
  }

  /** Handle a DeleteDeliveryDestination Command from the SDK. */
  async deleteDeliveryDestination(
    command: simLogsCommands.SimDeleteDeliveryDestinationCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDeleteDeliveryDestinationCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.deliveryDestinations.deleteDeliveryDestination(
      command,
      options,
    );
  }

  /** Handle a CreateDelivery Command from the SDK. */
  async createDelivery(
    command: simLogsCommands.SimCreateDeliveryCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimCreateDeliveryCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.deliveries.createDelivery(command, options);
  }

  /** Handle a DescribeDeliveries Command from the SDK. */
  async describeDeliveries(
    command: simLogsCommands.SimDescribeDeliveriesCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDescribeDeliveriesCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.deliveries.describeDeliveries(command, options);
  }

  /** Handle a DeleteDelivery Command from the SDK. */
  async deleteDelivery(
    command: simLogsCommands.SimDeleteDeliveryCommand,
    options?: SimLogsRequestOptions,
  ): Promise<simLogsCommands.SimDeleteDeliveryCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.deliveries.deleteDelivery(command, options);
  }
}

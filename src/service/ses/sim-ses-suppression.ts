import type * as simSesCommands from "./command/sim-ses-command.types.js";
import type { SimSesRequestOptions } from "./command/sim-ses-request-options.js";
import type { SimSesCommands } from "./sim-ses-commands.js";
import type { SimSesSuppressedDestination } from "./suppression/sim-ses-suppressed-destination.js";

interface SimSesSuppressionProperties {
  readonly commands: SimSesCommands;
}

/**
 * The account-level suppression list half of simulated SES.
 *
 * `SimSesV2` extends this, so a caller reaches every operation on the one
 * service object. They are separate classes because one class holding every
 * SES operation grows by a method with each one added, and the suppression
 * commands are the part of the API a reader can take in on their own.
 *
 * Real SES fills this list from hard bounces and complaints. A test supplies
 * that feedback explicitly, and callers may also manage entries through the
 * suppression commands.
 */
export abstract class SimSesSuppression {
  protected readonly commands: SimSesCommands;

  protected constructor(properties: SimSesSuppressionProperties) {
    this.commands = properties.commands;
  }

  /**
   * Every address on this account's suppression list, in the order they were
   * first put on it.
   *
   * The simulator's own accessor, for tests seeding or inspecting the list
   * without going through a Command and its authorization.
   */
  suppressedDestinations(): readonly SimSesSuppressedDestination[] {
    return this.commands.suppression.all;
  }

  /**
   * Handle a PutAccountSuppressionAttributes Command from the SDK.
   */
  async putAccountSuppressionAttributes(
    command?: simSesCommands.SimPutAccountSuppressionAttributesCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimPutAccountSuppressionAttributesCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.accountCommands.putAccountSuppressionAttributes(
      command,
      options,
    );
  }

  /**
   * Handle a PutSuppressedDestination Command from the SDK.
   */
  async putSuppressedDestination(
    command: simSesCommands.SimPutSuppressedDestinationCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimPutSuppressedDestinationCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.suppressionCommands.putSuppressedDestination(
      command,
      options,
    );
  }

  /**
   * Handle a GetSuppressedDestination Command from the SDK.
   */
  async getSuppressedDestination(
    command: simSesCommands.SimGetSuppressedDestinationCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimGetSuppressedDestinationCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.suppressionCommands.getSuppressedDestination(
      command,
      options,
    );
  }

  /**
   * Handle a ListSuppressedDestinations Command from the SDK.
   */
  async listSuppressedDestinations(
    command?: simSesCommands.SimListSuppressedDestinationsCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimListSuppressedDestinationsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.suppressionCommands.listSuppressedDestinations(
      command ?? {},
      options,
    );
  }

  /**
   * Handle a DeleteSuppressedDestination Command from the SDK.
   */
  async deleteSuppressedDestination(
    command: simSesCommands.SimDeleteSuppressedDestinationCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimDeleteSuppressedDestinationCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.suppressionCommands.deleteSuppressedDestination(
      command,
      options,
    );
  }
}

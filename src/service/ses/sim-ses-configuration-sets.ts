import type * as simSesCommands from "./command/sim-ses-command.types.js";
import type { SimSesRequestOptions } from "./command/sim-ses-request-options.js";
import type { SimSesConfigurationSet } from "./configuration-set/sim-ses-configuration-set.js";
import { SimSesSuppression } from "./sim-ses-suppression.js";

/**
 * The configuration set half of simulated SES.
 *
 * `SimSesV2` reaches it by extending this, the way it reaches the suppression
 * list, so a caller finds every operation on the one service object. They are
 * separate classes because one class holding every SES operation grows by a
 * method with each one added.
 *
 * A configuration set holds suppression reasons, the sending switch, delivery
 * options and the reputation switch. The sending switch acts on acceptance.
 * Suppression reasons act when feedback is recorded for an accepted message.
 * The remaining options are held for a test to read back.
 */
export abstract class SimSesConfigurationSets extends SimSesSuppression {
  /**
   * Find a configuration set by name.
   *
   * The simulator's own accessor, for tests asserting on what a stack declared
   * without going through a Command and its authorization.
   */
  findConfigurationSet(
    configurationSetName: string,
  ): SimSesConfigurationSet | undefined {
    return this.commands.configurationSets.find(configurationSetName);
  }

  /**
   * Every configuration set in this scope, in the order they were created.
   */
  allConfigurationSets(): readonly SimSesConfigurationSet[] {
    return this.commands.configurationSets.all;
  }

  /**
   * Handle a CreateConfigurationSet Command from the SDK.
   */
  async createConfigurationSet(
    command: simSesCommands.SimCreateConfigurationSetCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimCreateConfigurationSetCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.configurationSetCommands.createConfigurationSet(
      command,
      options,
    );
  }

  /**
   * Handle a GetConfigurationSet Command from the SDK.
   */
  async getConfigurationSet(
    command: simSesCommands.SimGetConfigurationSetCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimGetConfigurationSetCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.configurationSetCommands.getConfigurationSet(
      command,
      options,
    );
  }

  /**
   * Handle a ListConfigurationSets Command from the SDK.
   */
  async listConfigurationSets(
    command: simSesCommands.SimListConfigurationSetsCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimListConfigurationSetsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.configurationSetCommands.listConfigurationSets(
      command,
      options,
    );
  }

  /**
   * Handle a DeleteConfigurationSet Command from the SDK.
   */
  async deleteConfigurationSet(
    command: simSesCommands.SimDeleteConfigurationSetCommand,
    options?: SimSesRequestOptions,
  ): Promise<simSesCommands.SimDeleteConfigurationSetCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.configurationSetCommands.deleteConfigurationSet(
      command,
      options,
    );
  }
}

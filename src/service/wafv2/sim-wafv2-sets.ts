import type * as simWafCommands from "./command/sim-wafv2-command.types.js";
import type { SimWafRequestOptions } from "./command/sim-wafv2-request-options.js";
import type { SimWafCommands } from "./sim-wafv2-commands.js";

/**
 * The commands addressing the sets a web ACL's rules refer to, which are IP
 * sets and regex pattern sets.
 *
 * `SimWafV2` extends this, so a caller reaches every operation on the one
 * service object the way the real API presents them. They are split off
 * because web ACLs, the sets beside them and association are separate
 * concerns, and the facade grows by one method for every operation added.
 */
export abstract class SimWafSets {
  protected readonly commands: SimWafCommands;

  protected constructor(commands: SimWafCommands) {
    this.commands = commands;
  }

  /**
   * Handle a CreateIPSet Command from the SDK.
   */
  async createIpSet(
    command: simWafCommands.SimCreateIpSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimCreateIpSetCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.ipSetCommands.createIpSet(command, options);
  }

  /**
   * Handle a GetIPSet Command from the SDK.
   */
  async getIpSet(
    command: simWafCommands.SimGetIpSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimGetIpSetCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.ipSetCommands.getIpSet(command, options);
  }

  /**
   * Handle an UpdateIPSet Command from the SDK.
   */
  async updateIpSet(
    command: simWafCommands.SimUpdateIpSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimUpdateIpSetCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.ipSetCommands.updateIpSet(command, options);
  }

  /**
   * Handle a ListIPSets Command from the SDK.
   */
  async listIpSets(
    command: simWafCommands.SimListIpSetsCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimListIpSetsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.ipSetCommands.listIpSets(command, options);
  }

  /**
   * Handle a DeleteIPSet Command from the SDK.
   */
  async deleteIpSet(
    command: simWafCommands.SimDeleteIpSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimDeleteIpSetCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.ipSetCommands.deleteIpSet(command, options);
  }

  /**
   * Handle a CreateRegexPatternSet Command from the SDK.
   */
  async createRegexPatternSet(
    command: simWafCommands.SimCreateRegexPatternSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimCreateRegexPatternSetCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.regexPatternSetCommands.createRegexPatternSet(
      command,
      options,
    );
  }

  /**
   * Handle a GetRegexPatternSet Command from the SDK.
   */
  async getRegexPatternSet(
    command: simWafCommands.SimGetRegexPatternSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimGetRegexPatternSetCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.regexPatternSetCommands.getRegexPatternSet(
      command,
      options,
    );
  }

  /**
   * Handle an UpdateRegexPatternSet Command from the SDK.
   */
  async updateRegexPatternSet(
    command: simWafCommands.SimUpdateRegexPatternSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimUpdateRegexPatternSetCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.regexPatternSetCommands.updateRegexPatternSet(
      command,
      options,
    );
  }

  /**
   * Handle a ListRegexPatternSets Command from the SDK.
   */
  async listRegexPatternSets(
    command: simWafCommands.SimListRegexPatternSetsCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimListRegexPatternSetsCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.regexPatternSetCommands.listRegexPatternSets(
      command,
      options,
    );
  }

  /**
   * Handle a DeleteRegexPatternSet Command from the SDK.
   */
  async deleteRegexPatternSet(
    command: simWafCommands.SimDeleteRegexPatternSetCommand,
    options?: SimWafRequestOptions,
  ): Promise<simWafCommands.SimDeleteRegexPatternSetCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.regexPatternSetCommands.deleteRegexPatternSet(
      command,
      options,
    );
  }
}

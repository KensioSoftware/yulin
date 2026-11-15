import type * as simEventBridgeCommands from "./command/sim-event-bridge-command.types.js";
import type { SimEventBridgeRequestOptions } from "./command/sim-event-bridge-request-options.js";
import { SimEventBridgePartners } from "./sim-event-bridge-partners.js";

/**
 * The tag commands of the simulated EventBridge facade.
 *
 * They sit here because SimEventBridge grows by one delegating method per
 * simulated operation and is at the length this codebase allows. Rules and
 * event buses are the resources they tag.
 */
export abstract class SimEventBridgeTagging extends SimEventBridgePartners {
  /**
   * Handle a TagResource Command from the SDK.
   */
  async tagResource(
    command: simEventBridgeCommands.SimEventBridgeTagResourceCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimEventBridgeTagResourceCommandOutput> {
    await this.background.sequence();
    return this.commands.tags.tagResource(command, options);
  }

  /**
   * Handle an UntagResource Command from the SDK.
   */
  async untagResource(
    command: simEventBridgeCommands.SimEventBridgeUntagResourceCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimEventBridgeUntagResourceCommandOutput> {
    await this.background.sequence();
    return this.commands.tags.untagResource(command, options);
  }

  /**
   * Handle a ListTagsForResource Command from the SDK.
   */
  async listTagsForResource(
    command: simEventBridgeCommands.SimEventBridgeListTagsForResourceCommand,
    options?: SimEventBridgeRequestOptions,
  ): Promise<simEventBridgeCommands.SimEventBridgeListTagsForResourceCommandOutput> {
    await this.background.sequence();
    return this.commands.tags.listTagsForResource(command, options);
  }
}

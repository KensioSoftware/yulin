import type { BackgroundScheduler } from "../../util/background/background.js";
import type * as simSnsCommands from "./command/sim-sns-command.types.js";
import type { SimSnsCommands } from "./command/sim-sns-commands.js";
import type { SimSnsRequestOptions } from "./command/sim-sns-request-options.js";

/**
 * What every part of the simulated SNS facade is built over.
 */
export interface SimSnsFacadeProperties {
  readonly commands: SimSnsCommands;
  readonly background: BackgroundScheduler;
}

/**
 * The commands that tag, untag and list the tags of a topic.
 *
 * `SimSns` extends this, through `SimSnsSms`, so a caller reaches every
 * operation on the one service object the way the real API presents them.
 * They are split off because the facade grows by one method for every
 * operation added.
 */
export abstract class SimSnsTagging {
  protected readonly commands: SimSnsCommands;
  protected readonly background: BackgroundScheduler;

  protected constructor(properties: SimSnsFacadeProperties) {
    this.commands = properties.commands;
    this.background = properties.background;
  }

  /**
   * Handle a TagResource Command from the SDK.
   */
  async tagResource(
    command: simSnsCommands.SimTagResourceCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimTagResourceCommandOutput> {
    await this.background.sequence();
    return this.commands.topicTags.tagResource(command, options);
  }

  /**
   * Handle an UntagResource Command from the SDK.
   */
  async untagResource(
    command: simSnsCommands.SimUntagResourceCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimUntagResourceCommandOutput> {
    await this.background.sequence();
    return this.commands.topicTags.untagResource(command, options);
  }

  /**
   * Handle a ListTagsForResource Command from the SDK.
   */
  async listTagsForResource(
    command: simSnsCommands.SimListTagsForResourceCommand,
    options?: SimSnsRequestOptions,
  ): Promise<simSnsCommands.SimListTagsForResourceCommandOutput> {
    await this.background.sequence();
    return this.commands.topicTags.listTagsForResource(command, options);
  }
}

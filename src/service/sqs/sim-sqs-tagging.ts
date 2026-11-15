import type { BackgroundScheduler } from "../../util/background/background.js";
import type * as simSqsCommands from "./command/sim-sqs-command.types.js";
import type { SimSqsRequestOptions } from "./command/sim-sqs-request-options.js";
import type { SimSqsQueueTagCommands } from "./command/queue/sim-sqs-queue-tag-commands.js";

/**
 * The commands that tag, untag and list the tags of a queue.
 *
 * `SimSqs` extends this, so a caller reaches every operation on the one
 * service object the way the real API presents them. They are split off
 * because the facade grows by one method for every operation added.
 */
export abstract class SimSqsTagging {
  protected abstract readonly background: BackgroundScheduler;
  protected abstract readonly tagCommands: SimSqsQueueTagCommands;

  /**
   * Handle a TagQueue Command from the SDK.
   */
  async tagQueue(
    command: simSqsCommands.SimTagQueueCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimTagQueueCommandOutput> {
    await this.background.sequence();
    return this.tagCommands.tagQueue(command, options);
  }

  /**
   * Handle an UntagQueue Command from the SDK.
   */
  async untagQueue(
    command: simSqsCommands.SimUntagQueueCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimUntagQueueCommandOutput> {
    await this.background.sequence();
    return this.tagCommands.untagQueue(command, options);
  }

  /**
   * Handle a ListQueueTags Command from the SDK.
   */
  async listQueueTags(
    command: simSqsCommands.SimListQueueTagsCommand,
    options?: SimSqsRequestOptions,
  ): Promise<simSqsCommands.SimListQueueTagsCommandOutput> {
    await this.background.sequence();
    return this.tagCommands.listQueueTags(command, options);
  }
}

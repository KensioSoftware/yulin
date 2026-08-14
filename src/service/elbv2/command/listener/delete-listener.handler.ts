import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { SimElbV2CommandHandler } from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimDeleteListenerCommand,
  SimDeleteListenerCommandOutput,
} from "./listener.command.js";

/**
 * Simulated ELBv2 DeleteListenerCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_DeleteListener.html
 */
export class DeleteListenerCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<SimDeleteListenerCommand, SimDeleteListenerCommandOutput>
{
  /**
   * Delete a listener and the rules written on it.
   *
   * The rules go because they cannot exist without it: a rule ARN is built
   * from a listener ARN, and there is nothing for one to be evaluated by once
   * the listener is gone.
   */
  async handle(
    command: SimDeleteListenerCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimDeleteListenerCommandOutput> {
    const listenerArn = command.input.ListenerArn;

    if (listenerArn === undefined) {
      throw new SimElbV2ValidationError("ListenerArn is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize("DeleteListener", listenerArn, options);

    this.stores.deleteListener(this.stores.listeners.requireByArn(listenerArn));

    return { $metadata: {} };
  }
}

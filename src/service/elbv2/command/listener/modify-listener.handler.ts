import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2Action } from "../../action/sim-elbv2-action.js";
import type { SimElbV2ActionTargets } from "../../action/sim-elbv2-action-targets.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import type { SimElbV2ListenerChanges } from "../../listener/sim-elbv2-listener.js";
import { simElbV2Port, simElbV2Protocol } from "../../sim-elbv2-protocol.js";
import {
  SimElbV2CommandHandler,
  type SimElbV2CommandHandlerProperties,
} from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimModifyListenerCommand,
  SimModifyListenerCommandInput,
  SimModifyListenerCommandOutput,
} from "./listener.command.js";

interface ModifyListenerCommandHandlerProperties extends SimElbV2CommandHandlerProperties {
  readonly actionTargets: SimElbV2ActionTargets;
}

/**
 * Simulated ELBv2 ModifyListenerCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_ModifyListener.html
 */
export class ModifyListenerCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<SimModifyListenerCommand, SimModifyListenerCommandOutput>
{
  private readonly actionTargets: SimElbV2ActionTargets;

  constructor(properties: ModifyListenerCommandHandlerProperties) {
    super(properties);
    this.actionTargets = properties.actionTargets;
  }

  private static readChanges(
    input: SimModifyListenerCommandInput,
  ): SimElbV2ListenerChanges {
    return {
      port:
        input.Port === undefined ? undefined : simElbV2Port("Port", input.Port),
      protocol:
        input.Protocol === undefined
          ? undefined
          : simElbV2Protocol("Protocol", input.Protocol),
      sslPolicy: input.SslPolicy,
      certificates: input.Certificates,
      defaultActions:
        input.DefaultActions === undefined
          ? undefined
          : SimElbV2Action.readAll(input.DefaultActions, "DefaultActions"),
    };
  }

  /**
   * Change what a request names on a listener, leaving the rest as it was.
   *
   * The port is checked against the other listeners on the same load balancer
   * before anything changes, so a request moving a listener onto a port
   * another one holds leaves both where they were.
   */
  async handle(
    command: SimModifyListenerCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimModifyListenerCommandOutput> {
    const { input } = command;

    if (input.ListenerArn === undefined) {
      throw new SimElbV2ValidationError("ListenerArn is required");
    }

    const changes = ModifyListenerCommandHandler.readChanges(input);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize("ModifyListener", input.ListenerArn, options);

    const listener = this.stores.listeners.requireByArn(input.ListenerArn);

    this.actionTargets.requireTargetGroups(changes.defaultActions ?? []);

    if (changes.port !== undefined) {
      this.stores.listeners.requirePortAvailable(
        listener.loadBalancerArn,
        changes.port,
        listener,
      );
    }

    listener.modify(changes);

    return { $metadata: {}, Listeners: [listener.view()] };
  }
}

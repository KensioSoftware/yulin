import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2Action } from "../../action/sim-elbv2-action.js";
import type { SimElbV2ActionTargets } from "../../action/sim-elbv2-action-targets.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { SimElbV2Listener } from "../../listener/sim-elbv2-listener.js";
import { simElbV2Port, simElbV2Protocol } from "../../sim-elbv2-protocol.js";
import { simElbV2ResourceId } from "../../sim-elbv2-resource-id.js";
import {
  SimElbV2CommandHandler,
  type SimElbV2CommandHandlerProperties,
} from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimCreateListenerCommand,
  SimCreateListenerCommandOutput,
} from "./listener.command.js";

interface CreateListenerCommandHandlerProperties extends SimElbV2CommandHandlerProperties {
  readonly actionTargets: SimElbV2ActionTargets;
}

/**
 * Simulated ELBv2 CreateListenerCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_CreateListener.html
 */
export class CreateListenerCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<SimCreateListenerCommand, SimCreateListenerCommandOutput>
{
  private readonly actionTargets: SimElbV2ActionTargets;

  constructor(properties: CreateListenerCommandHandlerProperties) {
    super(properties);
    this.actionTargets = properties.actionTargets;
  }

  /**
   * Create a listener on a load balancer.
   *
   * The listener is authorized against the load balancer it goes on, because
   * that is the resource the request names and the resource an IAM policy
   * would be written about.
   */
  async handle(
    command: SimCreateListenerCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimCreateListenerCommandOutput> {
    const { input } = command;

    if (input.LoadBalancerArn === undefined) {
      throw new SimElbV2ValidationError("LoadBalancerArn is required");
    }

    if (input.Protocol === undefined || input.Port === undefined) {
      throw new SimElbV2ValidationError(
        "A listener requires a Protocol and a Port",
      );
    }

    const protocol = simElbV2Protocol("Protocol", input.Protocol);
    const port = simElbV2Port("Port", input.Port);
    const defaultActions = SimElbV2Action.readAll(
      input.DefaultActions,
      "DefaultActions",
    );

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize("CreateListener", input.LoadBalancerArn, options);

    const loadBalancer = this.stores.loadBalancers.requireByArn(
      input.LoadBalancerArn,
    );

    this.actionTargets.requireTargetGroups(defaultActions);
    this.stores.listeners.requirePortAvailable(loadBalancer.arn, port);

    const listener = new SimElbV2Listener({
      loadBalancerArn: loadBalancer.arn,
      id: simElbV2ResourceId(this.stores.listeners.nextSequence()),
      port,
      protocol,
      sslPolicy: input.SslPolicy,
      certificates: input.Certificates ?? [],
      defaultActions,
    });

    this.stores.listeners.put(listener);

    return { $metadata: {}, Listeners: [listener.view()] };
  }
}

import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimElbV2ActionTargets } from "../../action/sim-elbv2-action-targets.js";
import type { SimElbV2CertificateResolver } from "../../listener/certificate/sim-elbv2-certificate-resolver.js";
import { simElbV2ResourceId } from "../../sim-elbv2-resource-id.js";
import {
  SimElbV2CommandHandler,
  type SimElbV2CommandHandlerProperties,
} from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import { SimElbV2CreateListenerRequest } from "./create-listener-request.js";
import type {
  SimCreateListenerCommand,
  SimCreateListenerCommandOutput,
} from "./listener.command.js";

interface CreateListenerCommandHandlerProperties extends SimElbV2CommandHandlerProperties {
  readonly actionTargets: SimElbV2ActionTargets;
  readonly certificates: SimElbV2CertificateResolver;
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
  private readonly certificates: SimElbV2CertificateResolver;

  constructor(properties: CreateListenerCommandHandlerProperties) {
    super(properties);
    this.actionTargets = properties.actionTargets;
    this.certificates = properties.certificates;
  }

  /**
   * Create a listener on a load balancer.
   *
   * The listener is authorized against the load balancer it goes on, because
   * that is the resource the request names and the resource an IAM policy
   * would be written about.
   *
   * A certificate is resolved against simulated ACM alongside the target groups
   * a forward action names, since both are things the request points at that
   * have to exist for the listener to serve anything.
   */
  async handle(
    command: SimCreateListenerCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimCreateListenerCommandOutput> {
    const request = new SimElbV2CreateListenerRequest(command.input);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize(
      "CreateListener",
      request.loadBalancerArn,
      options,
    );

    const loadBalancer = this.stores.loadBalancers.requireByArn(
      request.loadBalancerArn,
    );

    this.actionTargets.requireTargetGroups(request.defaultActions);
    this.stores.listeners.requirePortAvailable(loadBalancer.arn, request.port);

    const listener = request.listener({
      loadBalancerArn: loadBalancer.arn,
      id: simElbV2ResourceId(this.stores.listeners.nextSequence()),
      certificateArn: this.certificates.resolveDefault(
        request.certificates,
        "Certificates",
      ),
    });

    this.stores.listeners.put(listener);

    return { $metadata: {}, Listeners: [listener.view()] };
  }
}

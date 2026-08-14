import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { SimElbV2CommandHandler } from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimDeleteLoadBalancerCommand,
  SimDeleteLoadBalancerCommandOutput,
} from "./load-balancer.command.js";

/**
 * Simulated ELBv2 DeleteLoadBalancerCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_DeleteLoadBalancer.html
 */
export class DeleteLoadBalancerCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimDeleteLoadBalancerCommand,
      SimDeleteLoadBalancerCommandOutput
    >
{
  /**
   * Delete a load balancer, its listeners and their rules.
   *
   * Target groups survive, as they do on real ELB: they are separate resources
   * that a replacement load balancer's listeners can forward to again.
   */
  async handle(
    command: SimDeleteLoadBalancerCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimDeleteLoadBalancerCommandOutput> {
    const loadBalancerArn = command.input.LoadBalancerArn;

    if (loadBalancerArn === undefined) {
      throw new SimElbV2ValidationError("LoadBalancerArn is required");
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorize("DeleteLoadBalancer", loadBalancerArn, options);

    this.stores.deleteLoadBalancer(
      this.stores.loadBalancers.requireByArn(loadBalancerArn),
    );

    return { $metadata: {} };
  }
}

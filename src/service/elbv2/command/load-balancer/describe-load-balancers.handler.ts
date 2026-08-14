import type { CommandHandler } from "../../../../command/command-handler.js";
import type { SimElbV2LoadBalancer } from "../../load-balancer/sim-elbv2-load-balancer.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import { SimElbV2Page } from "../sim-elbv2-page.js";
import { SimElbV2CommandHandler } from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimDescribeLoadBalancersCommand,
  SimDescribeLoadBalancersCommandInput,
  SimDescribeLoadBalancersCommandOutput,
} from "./load-balancer.command.js";

/**
 * Simulated ELBv2 DescribeLoadBalancersCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_DescribeLoadBalancers.html
 */
export class DescribeLoadBalancersCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimDescribeLoadBalancersCommand,
      SimDescribeLoadBalancersCommandOutput
    >
{
  /**
   * Real ELB takes ARNs or names, never both, since the two could disagree.
   */
  private static requireOneSelector(
    input: SimDescribeLoadBalancersCommandInput,
  ): void {
    if (input.LoadBalancerArns !== undefined && input.Names !== undefined) {
      throw new SimElbV2ValidationError(
        "DescribeLoadBalancers takes LoadBalancerArns or Names, not both",
      );
    }
  }

  /**
   * Describe the load balancers a request names, or all of them.
   *
   * Naming one that does not exist is a refusal rather than an omission from
   * the answer, which is what real ELB does and is the difference between a
   * describe and a listing.
   */
  async handle(
    command: SimDescribeLoadBalancersCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimDescribeLoadBalancersCommandOutput> {
    const { input } = command;

    DescribeLoadBalancersCommandHandler.requireOneSelector(input);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorizeAnyResource("DescribeLoadBalancers", options);

    const page = new SimElbV2Page(
      this.selected(input),
      input.PageSize,
      input.Marker,
    );

    return {
      $metadata: {},
      LoadBalancers: page.items.map((loadBalancer) => loadBalancer.view()),
      NextMarker: page.nextMarker,
    };
  }

  private selected(
    input: SimDescribeLoadBalancersCommandInput,
  ): readonly SimElbV2LoadBalancer[] {
    if (input.LoadBalancerArns !== undefined) {
      return input.LoadBalancerArns.map((arn) =>
        this.stores.loadBalancers.requireByArn(arn),
      );
    }

    if (input.Names !== undefined) {
      return input.Names.map((name) =>
        this.stores.loadBalancers.requireByName(name),
      );
    }

    return this.stores.loadBalancers.all;
  }
}

import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import type { SimElbV2Listener } from "../../listener/sim-elbv2-listener.js";
import { SimElbV2Page } from "../sim-elbv2-page.js";
import { SimElbV2CommandHandler } from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimDescribeListenersCommand,
  SimDescribeListenersCommandInput,
  SimDescribeListenersCommandOutput,
} from "./listener.command.js";

/**
 * Which listeners a describe named, resolved to one of the two ways.
 */
type SimElbV2ListenerSelector =
  | {
      readonly listenerArns: readonly string[];
      readonly loadBalancerArn?: undefined;
    }
  | { readonly listenerArns?: undefined; readonly loadBalancerArn: string };

/**
 * Simulated ELBv2 DescribeListenersCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_DescribeListeners.html
 */
export class DescribeListenersCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimDescribeListenersCommand,
      SimDescribeListenersCommandOutput
    >
{
  /**
   * Read which of the two ways of naming listeners a request used.
   *
   * Real ELB requires exactly one of them, and answering with the resolved
   * choice rather than with nothing is what keeps the reading of it in one
   * place instead of split between a check and a later re-read.
   */
  private static readSelector(
    input: SimDescribeListenersCommandInput,
  ): SimElbV2ListenerSelector {
    if (
      input.ListenerArns !== undefined &&
      input.LoadBalancerArn === undefined
    ) {
      return { listenerArns: input.ListenerArns };
    }

    if (
      input.LoadBalancerArn !== undefined &&
      input.ListenerArns === undefined
    ) {
      return { loadBalancerArn: input.LoadBalancerArn };
    }

    throw new SimElbV2ValidationError(
      "DescribeListeners takes either ListenerArns or LoadBalancerArn",
    );
  }

  /**
   * Describe the listeners a request names, or those on one load balancer.
   */
  async handle(
    command: SimDescribeListenersCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimDescribeListenersCommandOutput> {
    const { input } = command;

    const selector = DescribeListenersCommandHandler.readSelector(input);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorizeAnyResource("DescribeListeners", options);

    const page = new SimElbV2Page(
      this.selected(selector),
      input.PageSize,
      input.Marker,
    );

    return {
      $metadata: {},
      Listeners: page.items.map((listener) => listener.view()),
      NextMarker: page.nextMarker,
    };
  }

  private selected(
    selector: SimElbV2ListenerSelector,
  ): readonly SimElbV2Listener[] {
    if (selector.listenerArns === undefined) {
      const loadBalancer = this.stores.loadBalancers.requireByArn(
        selector.loadBalancerArn,
      );

      return this.stores.listeners.forLoadBalancer(loadBalancer.arn);
    }

    return selector.listenerArns.map((arn) =>
      this.stores.listeners.requireByArn(arn),
    );
  }
}

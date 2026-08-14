import type { CommandHandler } from "../../../../command/command-handler.js";
import { SimElbV2ValidationError } from "../../error/sim-elbv2.error.js";
import {
  simElbV2DefaultRuleView,
  type SimElbV2ListenerRuleView,
} from "../../listener/rule/sim-elbv2-listener-rule.js";
import { SimElbV2Page } from "../sim-elbv2-page.js";
import { SimElbV2CommandHandler } from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimDescribeRulesCommand,
  SimDescribeRulesCommandInput,
  SimDescribeRulesCommandOutput,
} from "./rule.command.js";

/**
 * Which rules a describe named, resolved to one of the two ways.
 */
type SimElbV2RuleSelector =
  | { readonly ruleArns: readonly string[]; readonly listenerArn?: undefined }
  | { readonly ruleArns?: undefined; readonly listenerArn: string };

/**
 * Simulated ELBv2 DescribeRulesCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_DescribeRules.html
 */
export class DescribeRulesCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<SimDescribeRulesCommand, SimDescribeRulesCommandOutput>
{
  /**
   * Read which of the two ways of naming rules a request used.
   *
   * Real ELB requires exactly one of them, and answering with the resolved
   * choice rather than with nothing is what keeps the reading of it in one
   * place instead of split between a check and a later re-read.
   */
  private static readSelector(
    input: SimDescribeRulesCommandInput,
  ): SimElbV2RuleSelector {
    if (input.RuleArns !== undefined && input.ListenerArn === undefined) {
      return { ruleArns: input.RuleArns };
    }

    if (input.ListenerArn !== undefined && input.RuleArns === undefined) {
      return { listenerArn: input.ListenerArn };
    }

    throw new SimElbV2ValidationError(
      "DescribeRules takes either RuleArns or ListenerArn",
    );
  }

  /**
   * Describe the rules a request names, or those on one listener.
   *
   * A listener's rules come back in priority order with the default rule last,
   * which is the order the listener would evaluate them in and the order real
   * ELB reports.
   */
  async handle(
    command: SimDescribeRulesCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimDescribeRulesCommandOutput> {
    const { input } = command;

    const selector = DescribeRulesCommandHandler.readSelector(input);

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    this.authorizer.authorizeAnyResource("DescribeRules", options);

    const page = new SimElbV2Page(
      this.selected(selector),
      input.PageSize,
      input.Marker,
    );

    return {
      $metadata: {},
      Rules: page.items,
      NextMarker: page.nextMarker,
    };
  }

  private selected(
    selector: SimElbV2RuleSelector,
  ): readonly SimElbV2ListenerRuleView[] {
    if (selector.ruleArns === undefined) {
      const listener = this.stores.listeners.requireByArn(selector.listenerArn);

      return [
        ...this.stores.rules
          .forListener(listener.arn)
          .map((rule) => rule.view()),
        simElbV2DefaultRuleView(listener),
      ];
    }

    return selector.ruleArns.map((arn) =>
      this.stores.rules.requireByArn(arn).view(),
    );
  }
}

import type { CommandHandler } from "../../../../command/command-handler.js";
import {
  SimElbV2PriorityInUseException,
  SimElbV2ValidationError,
} from "../../error/sim-elbv2.error.js";
import type { SimElbV2ListenerRule } from "../../listener/rule/sim-elbv2-listener-rule.js";
import { simElbV2RulePriority } from "../../listener/rule/sim-elbv2-rule-priority.js";
import { SimElbV2CommandHandler } from "../sim-elbv2-command-handler.js";
import type { SimElbV2RequestOptions } from "../sim-elbv2-request-options.js";
import type {
  SimSetRulePrioritiesCommand,
  SimSetRulePrioritiesCommandOutput,
} from "./rule.command.js";

/**
 * One rule and where the request wants it moved to.
 */
interface SimElbV2RuleMove {
  readonly rule: SimElbV2ListenerRule;
  readonly priority: number;
}

/**
 * Simulated ELBv2 SetRulePrioritiesCommand handler.
 *
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_SetRulePriorities.html
 */
export class SetRulePrioritiesCommandHandler
  extends SimElbV2CommandHandler
  implements
    CommandHandler<
      SimSetRulePrioritiesCommand,
      SimSetRulePrioritiesCommandOutput
    >
{
  /**
   * Move rules to new priorities, all of them or none.
   *
   * The request is judged against the order it would leave behind rather than
   * against the one it started from, which is what lets two rules swap places
   * in one request. Checking each move against the current state instead would
   * refuse a swap because each rule's destination is still occupied.
   */
  async handle(
    command: SimSetRulePrioritiesCommand,
    options?: SimElbV2RequestOptions,
  ): Promise<SimSetRulePrioritiesCommandOutput> {
    const pairs = command.input.RulePriorities;

    if (pairs === undefined || pairs.length === 0) {
      throw new SimElbV2ValidationError(
        "RulePriorities must name at least one rule",
      );
    }

    // Allow for potential non-deterministic sequencing of async events.
    await this.background.sequence();

    const moves = pairs.map((pair) => {
      if (pair.RuleArn === undefined) {
        throw new SimElbV2ValidationError(
          "RulePriorities member requires a RuleArn",
        );
      }

      this.authorizer.authorize("SetRulePriorities", pair.RuleArn, options);

      return {
        rule: this.stores.rules.requireByArn(pair.RuleArn),
        priority: simElbV2RulePriority(pair.Priority),
      };
    });

    this.requireNoClash(moves);

    for (const move of moves) {
      move.rule.reprioritize(move.priority);
    }

    return { $metadata: {}, Rules: moves.map((move) => move.rule.view()) };
  }

  /**
   * Refuse a set of moves that would leave two rules on one listener sharing
   * a priority.
   */
  private requireNoClash(moves: readonly SimElbV2RuleMove[]): void {
    const moved = new Map(moves.map((move) => [move.rule.arn, move.priority]));

    if (moved.size !== moves.length) {
      throw new SimElbV2ValidationError(
        "RulePriorities names the same rule more than once",
      );
    }

    const listenerArns = new Set(moves.map((move) => move.rule.listenerArn));

    for (const listenerArn of listenerArns) {
      const priorities = this.stores.rules
        .forListener(listenerArn)
        .map((rule) => moved.get(rule.arn) ?? rule.priority);

      if (new Set(priorities).size !== priorities.length) {
        throw new SimElbV2PriorityInUseException(
          `These priorities would leave two rules on listener ${listenerArn} ` +
            `sharing one`,
        );
      }
    }
  }
}

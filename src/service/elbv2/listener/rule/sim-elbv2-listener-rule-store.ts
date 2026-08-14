import {
  SimElbV2PriorityInUseException,
  SimElbV2RuleNotFoundException,
} from "../../error/sim-elbv2.error.js";
import type { SimElbV2ListenerRule } from "./sim-elbv2-listener-rule.js";

/**
 * The listener rules of one simulated ELBv2 scope.
 *
 * Priority uniqueness is this store's to keep, because it is a property of a
 * listener's whole set of rules rather than of any one rule: two rules that
 * each look valid alone are invalid together if they claim the same place in
 * the order.
 */
export class SimElbV2ListenerRuleStore {
  private readonly rules = new Map<string, SimElbV2ListenerRule>();
  private sequence = 0;

  /**
   * Every rule in this scope, in creation order.
   */
  get all(): readonly SimElbV2ListenerRule[] {
    return this.rules.values().toArray();
  }

  /**
   * Take the next id for a rule about to be created.
   */
  nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  /**
   * Every rule on one listener, in the order that listener evaluates them.
   */
  forListener(listenerArn: string): readonly SimElbV2ListenerRule[] {
    return this.all
      .filter((rule) => rule.listenerArn === listenerArn)
      .toSorted((left, right) => left.priority - right.priority);
  }

  /**
   * Refuse a priority another rule on the same listener already claims.
   *
   * The rule being moved is passed when this is a reordering, so a rule
   * staying where it is does not clash with itself.
   */
  requirePriorityAvailable(
    listenerArn: string,
    priority: number,
    moving?: SimElbV2ListenerRule,
  ): void {
    const clash = this.forListener(listenerArn).find(
      (rule) => rule.priority === priority && rule !== moving,
    );

    if (clash !== undefined) {
      throw new SimElbV2PriorityInUseException(
        `Priority ${String(priority)} is already in use by rule ${clash.arn}`,
      );
    }
  }

  /**
   * Store a created rule.
   */
  put(rule: SimElbV2ListenerRule): void {
    this.rules.set(rule.arn, rule);
  }

  /**
   * Resolve a rule by ARN, or refuse.
   */
  requireByArn(arn: string): SimElbV2ListenerRule {
    const found = this.rules.get(arn);

    if (found === undefined) {
      throw new SimElbV2RuleNotFoundException(
        `No sim ELBv2 listener rule with ARN ${arn}`,
      );
    }

    return found;
  }

  /**
   * Forget a deleted rule.
   */
  remove(rule: SimElbV2ListenerRule): void {
    this.rules.delete(rule.arn);
  }
}

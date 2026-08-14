import type { SimEventRule } from "../rule/sim-event-rule.js";
import type { SimEventTarget } from "./sim-event-target.js";

/**
 * The most targets real EventBridge allows on one rule.
 */
export const simEventMaximumTargets = 5;

/**
 * How a rule's targets are keyed, which is by bus as well as by rule name,
 * since a rule name is only unique within one bus.
 */
function ruleKey(busName: string, ruleName: string): string {
  return `${busName} ${ruleName}`;
}

/**
 * The targets of the rules of one simulated EventBridge scope.
 *
 * Targets are held apart from the rules rather than on them, the same way a
 * topic's subscriptions are held apart from the topic in simulated SNS. A rule
 * with no targets is a rule that matches events and sends them nowhere, which
 * is a thing real EventBridge lets you have, and holding them apart is what
 * keeps that from looking like a broken rule.
 */
export class SimEventTargetStore {
  private readonly byRule = new Map<string, SimEventTarget[]>();

  /**
   * The targets of one rule, in the order they were added.
   */
  forRule(busName: string, ruleName: string): readonly SimEventTarget[] {
    return this.byRule.get(ruleKey(busName, ruleName)) ?? [];
  }

  /**
   * Add targets to a rule, replacing any of the same id.
   *
   * Replacing by id is what PutTargets does: a second request naming an
   * existing id is that target's new definition rather than a second target
   * beside it.
   */
  put(
    busName: string,
    ruleName: string,
    targets: readonly SimEventTarget[],
  ): void {
    const key = ruleKey(busName, ruleName);
    const kept = this.forRule(busName, ruleName).filter((existing) =>
      targets.every((target) => target.id !== existing.id),
    );

    this.byRule.set(key, [...kept, ...targets]);
  }

  /**
   * Remove the targets of a rule by id, answering the ids that were not there.
   */
  remove(
    busName: string,
    ruleName: string,
    ids: readonly string[],
  ): readonly string[] {
    const key = ruleKey(busName, ruleName);
    const existing = this.forRule(busName, ruleName);

    this.byRule.set(
      key,
      existing.filter((target) => !ids.includes(target.id)),
    );

    return ids.filter((id) => existing.every((target) => target.id !== id));
  }

  /**
   * Forget every target of a rule, which deleting that rule does.
   */
  removeForRule(busName: string, ruleName: string): void {
    this.byRule.delete(ruleKey(busName, ruleName));
  }

  /**
   * Forget the targets of every rule of a bus, which deleting that bus does.
   */
  removeForRules(rules: readonly SimEventRule[]): void {
    for (const rule of rules) {
      this.removeForRule(rule.busName.value, rule.name.value);
    }
  }

  /**
   * Whether any rule of a bus sends events to a target ARN.
   */
  rulesSendingTo(
    rules: readonly SimEventRule[],
    targetArn: string,
  ): readonly SimEventRule[] {
    return rules.filter((rule) =>
      this.forRule(rule.busName.value, rule.name.value).some(
        (target) => target.arn.value === targetArn,
      ),
    );
  }
}

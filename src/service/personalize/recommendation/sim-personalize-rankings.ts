import { SimDeclaredResultRules } from "../../../util/rule/sim-declared-result-rules.js";
import type { SimPersonalizeDeclaredItems } from "./sim-personalize-item-declaration.js";
import { requireSimPersonalizeRuleKey } from "./sim-personalize-rule-key.js";

/**
 * The rankings one campaign answers GetPersonalizedRanking with.
 *
 * A rule for an exact user wins, then the default. There is no item rule
 * here, unlike the recommendations beside it: a ranking request names a user
 * and the list to rank, never one item, so an item rule would be a rule
 * nothing could ever match.
 *
 * Nothing declared at all is the case worth having. The request already
 * carries the items, and a ranking with no rule answers with them in the
 * order they arrived, so a test that does not care about the order does not
 * have to write one down.
 */
export class SimPersonalizeRankings {
  private readonly rules = new SimDeclaredResultRules<
    SimPersonalizeDeclaredItems | undefined
  >(undefined);

  /**
   * Answer with these items for any request no other rule matches.
   */
  byDefault(result: SimPersonalizeDeclaredItems): void {
    this.rules.byDefault(result);
  }

  /**
   * Answer with these items for a request naming this exact user.
   */
  onUser(userId: string, result: SimPersonalizeDeclaredItems): void {
    this.rules.onTrailingKey(
      requireSimPersonalizeRuleKey(userId, "a user id"),
      result,
    );
  }

  /**
   * The items declared for one ranking request, where any are.
   */
  itemsFor(userId: string): SimPersonalizeDeclaredItems | undefined {
    return this.rules.resultFor({ trailing: userId });
  }
}

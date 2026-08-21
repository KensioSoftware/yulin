import { SimDeclaredResultRules } from "../../../util/rule/sim-declared-result-rules.js";
import type { SimPersonalizeDeclaredItems } from "./sim-personalize-item-declaration.js";
import { requireSimPersonalizeRuleKey } from "./sim-personalize-rule-key.js";

/**
 * The request a recommendation rule is matched against.
 */
export interface SimPersonalizeRecommendationRequest {
  readonly itemId?: string | undefined;
  readonly userId?: string | undefined;
}

/**
 * What GetRecommendations answers with where nothing is declared.
 *
 * Real Personalize answers an item it does not recognise with popular items,
 * which it knows from the interaction history. Simulated Personalize holds no
 * interactions, so it answers with nothing rather than inventing a catalogue
 * to be popular in.
 */
const nothingRecommended: SimPersonalizeDeclaredItems = { itemIds: [] };

/**
 * The recommendations one campaign answers GetRecommendations with.
 *
 * A rule for an exact item wins, then a rule for an exact user, then the
 * default. Item first because the related-items recipes are the ones whose
 * requests name an item at all: `aws-similar-items` requires `itemId` and
 * ignores `userId`, where the user-personalization recipes require `userId`
 * and name no item. A request therefore reaches the tier its own recipe
 * would have used.
 */
export class SimPersonalizeRecommendations {
  private readonly rules =
    new SimDeclaredResultRules<SimPersonalizeDeclaredItems>(nothingRecommended);

  /**
   * Answer with these items for any request no other rule matches.
   */
  byDefault(result: SimPersonalizeDeclaredItems): void {
    this.rules.byDefault(result);
  }

  /**
   * Answer with these items for a request naming this exact item.
   */
  onItem(itemId: string, result: SimPersonalizeDeclaredItems): void {
    this.rules.onLeadingKey(
      requireSimPersonalizeRuleKey(itemId, "an item id"),
      result,
    );
  }

  /**
   * Answer with these items for a request naming this exact user, where no
   * item rule matched it first.
   */
  onUser(userId: string, result: SimPersonalizeDeclaredItems): void {
    this.rules.onTrailingKey(
      requireSimPersonalizeRuleKey(userId, "a user id"),
      result,
    );
  }

  /**
   * The items declared for one recommendation request.
   */
  itemsFor(
    request: SimPersonalizeRecommendationRequest,
  ): SimPersonalizeDeclaredItems {
    return this.rules.resultFor({
      leading: request.itemId,
      trailing: request.userId,
    });
  }
}

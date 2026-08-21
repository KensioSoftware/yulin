/**
 * An item declared against a campaign, with what the runtime is to report
 * alongside it.
 *
 * The score is the declaration's own. Nothing here computes one, because
 * there is no model behind it to compute one from, so an item declared
 * without a score comes back without a score.
 */
export interface SimPersonalizeDeclaredItem {
  readonly itemId: string;
  readonly score?: number | undefined;
}

/**
 * An item as a rule declares it: an item id on its own, or an id with what is
 * to be reported with it.
 */
export type SimPersonalizeItemDeclaration = string | SimPersonalizeDeclaredItem;

/**
 * What one runtime call answers with: the items, in the order they are to
 * come back in.
 *
 * Both runtime operations answer with an ordered list of items, so both
 * declare one. `GetRecommendations` reports it as `itemList` and
 * `GetPersonalizedRanking` as `personalizedRanking`.
 */
export interface SimPersonalizeDeclaredItems {
  readonly itemIds: readonly SimPersonalizeItemDeclaration[];
  readonly recommendationId?: string | undefined;
}

/**
 * Read a declaration that may be a bare item id.
 */
export function simPersonalizeDeclaredItem(
  declaration: SimPersonalizeItemDeclaration,
): SimPersonalizeDeclaredItem {
  if (typeof declaration === "string") {
    return { itemId: declaration };
  }

  return declaration;
}

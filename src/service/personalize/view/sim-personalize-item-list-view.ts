import type { SimPersonalizePredictedItem } from "../command/runtime/runtime.command.js";
import {
  simPersonalizeDeclaredItem,
  type SimPersonalizeItemDeclaration,
} from "../recommendation/sim-personalize-item-declaration.js";

/**
 * The items a runtime call answers with, as they were declared.
 *
 * An item declared without a score comes back without the field at all. Real
 * Personalize leaves `score` out where the recipe behind the campaign reports
 * none, and a `score` of `undefined` reads as a score to a test comparing the
 * whole item.
 */
export function simPersonalizeItemList(
  declarations: readonly SimPersonalizeItemDeclaration[],
): readonly SimPersonalizePredictedItem[] {
  return declarations.map((declaration) => {
    const item = simPersonalizeDeclaredItem(declaration);

    if (item.score === undefined) {
      return { itemId: item.itemId };
    }

    return { itemId: item.itemId, score: item.score };
  });
}

/**
 * The items a ranking no rule matched answers with: the list the request
 * carried, in the order it arrived.
 *
 * The scores descend so that the first item is the one ranked highest, as a
 * caller sorting by score would expect, and they sum to one across the list
 * as a real ranking's do. What they do not do is say anything about the
 * items. A test that cares which item ranks where declares a rule.
 */
export function simPersonalizeRankedInputList(
  inputList: readonly string[],
): readonly SimPersonalizePredictedItem[] {
  const places = inputList.length;
  const total = (places * (places + 1)) / 2;

  return inputList.map((itemId, index) => ({
    itemId,
    score: (places - index) / total,
  }));
}

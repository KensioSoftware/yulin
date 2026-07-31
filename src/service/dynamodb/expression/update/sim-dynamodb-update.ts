import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import { SimDynamoDbItemSnapshot } from "../sim-dynamodb-item-snapshot.js";
import { SimDynamoDbProjection } from "../projection/sim-dynamodb-projection.js";
import type { SimDynamoDbUpdateAction } from "./sim-dynamodb-update-action.js";
import { SimDynamoDbUpdateDocument } from "./sim-dynamodb-update-document.js";
import { updateExpressionName } from "./sim-dynamodb-update-refusal.js";
import { assertSimDynamoDbUpdateTargetsAgree } from "./sim-dynamodb-update-target.js";

/**
 * What one UpdateExpression does to an item.
 *
 * Every action reads the item as it stood before the update, so the order they
 * are written in does not change what they read. The order they are applied in
 * does matter for one thing: removing a list element closes the list up, so
 * removals go last and furthest index first, and every index an expression
 * names still means what it meant against the stored item.
 */
export class SimDynamoDbUpdate {
  private readonly actions: readonly SimDynamoDbUpdateAction[];

  constructor(actions: readonly SimDynamoDbUpdateAction[]) {
    assertSimDynamoDbUpdateTargetsAgree(actions.map((action) => action.target));

    this.actions = actions.toSorted(removalsLast);
  }

  /**
   * Refuse an update that would move an item's primary key.
   *
   * A key attribute names which item this is, so changing one would make this a
   * write to a different item. Real DynamoDB refuses it, and UpdateItem takes
   * the key it works on from the request's `Key`.
   */
  assertLeavesKeyAlone(keyAttributeNames: readonly string[]): void {
    for (const action of this.actions) {
      if (action.target.namesOneOf(keyAttributeNames)) {
        throw new SimDynamoDbValidationException(
          `One or more parameter values were invalid: Cannot ${action.verb} ` +
            `attribute ${action.target.text}. This attribute is part of the key`,
        );
      }
    }
  }

  /**
   * The parts of an item this update touched.
   *
   * `UPDATED_OLD` and `UPDATED_NEW` report those parts and nothing else, which
   * is the same job a ProjectionExpression does, so it is the same machinery.
   */
  touched(): SimDynamoDbProjection {
    return new SimDynamoDbProjection({
      expressionName: updateExpressionName,
      paths: this.actions.map((action) => action.target.path),
    });
  }

  /**
   * The item this update makes of the one that was there.
   *
   * UpdateItem upserts, so with nothing stored under the key the new item is
   * built from the Key the request named. Every action still reads the snapshot,
   * which holds nothing in that case.
   */
  applyTo(
    existing: SimDynamoDbItem | undefined,
    key: SimDynamoDbItem,
  ): SimDynamoDbItem {
    const snapshot = new SimDynamoDbItemSnapshot(existing);
    const document = new SimDynamoDbUpdateDocument(
      existing?.entries() ?? key.entries(),
    );

    for (const action of this.actions) {
      action.applyTo(document, snapshot);
    }

    return document.toItem();
  }
}

/**
 * Order two actions so that removals come last, furthest list index first.
 *
 * Nothing else shifts anything around, so every other pair of actions is left
 * in the order it was written.
 */
function removalsLast(
  one: SimDynamoDbUpdateAction,
  other: SimDynamoDbUpdateAction,
): number {
  const difference = removalRank(one) - removalRank(other);

  if (difference !== 0) {
    return difference;
  }

  if (!one.closesUpLists) {
    // Nothing else moves anything, so two of them stay as they were written.
    // That is what makes `SET lines[8] = :a, lines[9] = :b` append in order.
    return 0;
  }

  return laterPathFirst(one, other);
}

/**
 * Whether an action closes a list up as it applies.
 */
function removalRank(action: SimDynamoDbUpdateAction): number {
  return Number(action.closesUpLists);
}

/**
 * Order two paths so that the further along one goes first.
 */
function laterPathFirst(
  one: SimDynamoDbUpdateAction,
  other: SimDynamoDbUpdateAction,
): number {
  const mine = one.target.removalOrder;
  const theirs = other.target.removalOrder;

  return Number(mine < theirs) - Number(mine > theirs);
}

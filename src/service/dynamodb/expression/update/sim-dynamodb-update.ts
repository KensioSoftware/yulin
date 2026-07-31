import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import { SimDynamoDbItemSnapshot } from "../sim-dynamodb-item-snapshot.js";
import type { SimDynamoDbUpdateAction } from "./sim-dynamodb-update-action.js";
import { SimDynamoDbUpdateDocument } from "./sim-dynamodb-update-document.js";
import { assertSimDynamoDbUpdateTargetsAgree } from "./sim-dynamodb-update-target.js";

/**
 * What one UpdateExpression does to an item.
 *
 * The actions are held in the order they were written, but the order they are
 * applied in does not change the answer: each one reads the item as it stood
 * before the update, so `REMOVE a SET b = a` still finds `a`.
 */
export class SimDynamoDbUpdate {
  private readonly actions: readonly SimDynamoDbUpdateAction[];

  constructor(actions: readonly SimDynamoDbUpdateAction[]) {
    assertSimDynamoDbUpdateTargetsAgree(actions.map((action) => action.target));

    this.actions = actions;
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

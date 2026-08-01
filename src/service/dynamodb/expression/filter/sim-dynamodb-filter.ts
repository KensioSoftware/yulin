import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbKeySchema } from "../../table/sim-dynamodb-key-schema.js";
import type { SimDynamoDbCondition } from "../condition/sim-dynamodb-condition.js";
import type { SimDynamoDbDocumentPath } from "../sim-dynamodb-document-path.js";
import { SimDynamoDbItemSnapshot } from "../sim-dynamodb-item-snapshot.js";

interface SimDynamoDbFilterProperties {
  readonly condition: SimDynamoDbCondition;
  readonly paths: readonly SimDynamoDbDocumentPath[];
}

/**
 * The filter a query or a scan drops items by.
 *
 * A filter runs after the read rather than during it. The walk is cut to the
 * `Limit` first, and the filter then drops items from the page that came back,
 * so a filtered page can be shorter than the limit or empty. It saves nothing:
 * every item it drops was read.
 *
 * It is the ordinary condition grammar, evaluated against each item the way a
 * conditional write is evaluated against the item it names. An item that does
 * not have what the filter points at fails it, since there is no third answer.
 */
export class SimDynamoDbFilter {
  private readonly condition: SimDynamoDbCondition;
  private readonly paths: readonly SimDynamoDbDocumentPath[];

  constructor(properties: SimDynamoDbFilterProperties) {
    this.condition = properties.condition;
    this.paths = properties.paths;
  }

  /**
   * The items of a page this filter holds for.
   */
  applyTo(items: readonly SimDynamoDbItem[]): readonly SimDynamoDbItem[] {
    return items.filter((item) =>
      this.condition.holdsFor(new SimDynamoDbItemSnapshot(item)),
    );
  }

  /**
   * Refuse a filter naming a key attribute of the table being read.
   *
   * Real DynamoDB refuses this on a query and allows it on a scan. A query has
   * already narrowed the read to the keys its key condition names, so a filter
   * on a key attribute is either that condition written twice or a condition
   * the key condition should have carried. A scan narrows nothing, so there a
   * key attribute is an attribute like any other.
   */
  assertNamesNoKeyAttribute(keySchema: SimDynamoDbKeySchema): void {
    for (const attributeName of keySchema.attributeNames()) {
      if (this.paths.some((path) => path.startsAt(attributeName))) {
        throw new SimDynamoDbValidationException(
          `Filter Expression can not contain key attributes: ` +
            `${attributeName} is part of the table's primary key, and a ` +
            `query narrows by its KeyConditionExpression instead`,
        );
      }
    }
  }
}

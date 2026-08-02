import type { SimArn } from "../../aws/arn.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeDefinitions } from "../table/sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import type { SimDynamoDbTableBilling } from "../table/sim-dynamodb-table-billing.js";
import type { SimDynamoDbIndexAttributes } from "./sim-dynamodb-index-attributes.js";
import type { SimDynamoDbIndexProjection } from "./sim-dynamodb-index-projection.js";

/**
 * What a secondary index needs from the table it is declared on.
 *
 * The table key schema is here because a local secondary index is declared
 * against it: its partition key is the table's, and its sort key is anything
 * the table is not already sorted by.
 */
export interface SimDynamoDbSecondaryIndexTable {
  readonly tableArn: SimArn;
  readonly keySchema: SimDynamoDbKeySchema;
  readonly billing: SimDynamoDbTableBilling;
}

/**
 * One secondary index of a table, whichever of the two kinds it is.
 *
 * A read reaches an index through this rather than through either class, since
 * walking an index is the same walking whichever kind it is. The two kinds
 * differ in two answers, and both are asked for here: which attributes a read
 * of the index can answer with, and whether it can answer a strongly
 * consistent read at all.
 */
export interface SimDynamoDbSecondaryIndex {
  readonly name: string;
  readonly arn: SimArn;
  readonly keySchema: SimDynamoDbKeySchema;
  readonly projection: SimDynamoDbIndexProjection;

  /**
   * Which attributes a read of this index answers with.
   *
   * The key attributes are supplied rather than worked out here, since they
   * are the index key and the table key together and only the read knows both.
   */
  attributesOf(
    keyAttributeNames: ReadonlySet<string>,
  ): SimDynamoDbIndexAttributes;

  /**
   * Refuse a strongly consistent read this index cannot answer.
   */
  assertAnswersConsistentRead(): void;

  /**
   * Refuse a read of this index while it is still being built.
   */
  assertReadable(): void;

  /**
   * Refuse an item carrying one of this index's key attributes as another type.
   */
  assertItemKeyTypes(
    item: SimDynamoDbItem,
    attributeDefinitions: SimDynamoDbAttributeDefinitions,
  ): void;
}

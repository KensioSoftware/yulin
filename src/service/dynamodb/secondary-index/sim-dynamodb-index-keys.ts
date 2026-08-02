import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeDefinitions } from "../table/sim-dynamodb-attribute-definitions.js";
import { SimDynamoDbItemKey } from "../table/sim-dynamodb-item-key.js";
import type { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";
import { simDynamoDbPrimaryKeyAttributes } from "../table/sim-dynamodb-primary-key.js";

interface SimDynamoDbIndexKeysProperties {
  readonly indexName: string;
  readonly indexKeySchema: SimDynamoDbKeySchema;
  readonly tableKeySchema: SimDynamoDbKeySchema;
  readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
  readonly tableItemKey: SimDynamoDbItemKey;
}

/**
 * How one index entry is keyed and identified.
 *
 * An entry is keyed by the index key, which says where it sits, and identified
 * by the table key, which says which item it is. An index key is not unique, so
 * neither half names an entry on its own.
 *
 * That is why the entry has to carry both, why a pagination token carries both,
 * and why a token missing either is refused rather than resumed from.
 */
export class SimDynamoDbIndexKeys {
  /**
   * The index key and the table key together.
   */
  public readonly attributeNames: ReadonlySet<string>;

  /**
   * The index key as the entries are marshalled by, which a scan orders on.
   */
  public readonly indexItemKey: SimDynamoDbItemKey;

  private readonly indexName: string;
  private readonly indexKeySchema: SimDynamoDbKeySchema;
  private readonly tableKeySchema: SimDynamoDbKeySchema;
  private readonly tableItemKey: SimDynamoDbItemKey;

  constructor(properties: SimDynamoDbIndexKeysProperties) {
    this.indexName = properties.indexName;
    this.indexKeySchema = properties.indexKeySchema;
    this.tableKeySchema = properties.tableKeySchema;
    this.tableItemKey = properties.tableItemKey;
    this.indexItemKey = new SimDynamoDbItemKey(
      properties.indexKeySchema,
      properties.attributeDefinitions,
    );
    this.attributeNames = new Set([
      ...properties.indexKeySchema.attributeNames(),
      ...properties.tableKeySchema.attributeNames(),
    ]);
  }

  /**
   * Whether the index holds an item, which needs the whole of the index key.
   *
   * This is what makes an index sparse. Nothing said so when the item was
   * written: it is worked out here, when the index is read.
   */
  holds(item: SimDynamoDbItem): boolean {
    return this.indexKeySchema
      .attributeNames()
      .every((attributeName) => item.attribute(attributeName) !== undefined);
  }

  /**
   * The token naming the entry a walk stopped on, by both of its keys.
   */
  tokenKey(item: SimDynamoDbItem): Record<string, SimDynamoDbAttributeValue> {
    return {
      ...simDynamoDbPrimaryKeyAttributes(item, this.indexKeySchema),
      ...simDynamoDbPrimaryKeyAttributes(item, this.tableKeySchema),
    };
  }

  /**
   * Refuse an `ExclusiveStartKey` this index could not have handed out.
   *
   * Both keys are required and nothing else is allowed alongside them. Without
   * the table key the token names several entries, so resuming from it would
   * repeat one or skip one.
   */
  assertStartKey(key: SimDynamoDbItem): void {
    for (const attributeName of key.attributeNames()) {
      if (!this.attributeNames.has(attributeName)) {
        throw new SimDynamoDbValidationException(
          `The provided starting key is invalid: the Key names the attribute ` +
            `${attributeName}, which is part of neither the index ` +
            `${this.indexName} key nor the table's primary key`,
        );
      }
    }

    this.indexItemKey.of(key);
    this.tableItemKey.of(key);
  }
}

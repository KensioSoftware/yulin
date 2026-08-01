import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbAttributeDefinitions } from "../table/sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbKeySchema } from "../table/sim-dynamodb-key-schema.js";

interface SimDynamoDbIndexKeyTypesProperties {
  readonly indexName: string;
  readonly keySchema: SimDynamoDbKeySchema;
  readonly item: SimDynamoDbItem;
  readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
}

/**
 * Refuse an item carrying an index key attribute as another type.
 *
 * This is the one thing a write is held to on account of an index. An item
 * missing an index key attribute is simply absent from the index, since a
 * global secondary index is sparse, but one carrying the attribute as a type
 * the index did not declare could never be held by it at all.
 */
export function assertSimDynamoDbIndexKeyTypes(
  properties: SimDynamoDbIndexKeyTypesProperties,
): void {
  const { indexName, item, attributeDefinitions } = properties;

  for (const attributeName of properties.keySchema.attributeNames()) {
    const value = item.attribute(attributeName);
    const declared = attributeDefinitions.typeOf(attributeName);

    if (value !== undefined && value.kind !== declared) {
      throw new SimDynamoDbValidationException(
        `One or more parameter values were invalid: Type mismatch for Index ` +
          `Key ${attributeName} Expected: ${declared} Actual: ${value.kind} ` +
          `IndexName: ${indexName}`,
      );
    }
  }
}

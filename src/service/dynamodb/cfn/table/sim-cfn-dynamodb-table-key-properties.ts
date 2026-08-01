import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * The key a template gives its table, as the attributes it is made of.
 */
export interface SimCfnDynamoDbTableKey {
  readonly partitionKeyName: string;
  readonly partitionKeyType: string;
  readonly sortKeyName: string | undefined;
  readonly sortKeyType: string;
}

/**
 * One attribute a table's key is made of.
 */
interface SimCfnDynamoDbTableKeyAttribute {
  readonly name: string;
  readonly type: string;
  readonly keyType: string;
}

/**
 * The `KeySchema` and `AttributeDefinitions` properties of a table's key.
 *
 * A template states the key in two places and has to keep them in step, which
 * is a thing a test writing a template out by hand gets wrong. Building both
 * from the same attributes is what keeps them together.
 */
export function simCfnDynamoDbTableKeyProperties(
  key: SimCfnDynamoDbTableKey,
): SimCfnTemplateValueRecord {
  const attributes = keyAttributes(key);

  return {
    KeySchema: attributes.map((attribute) => ({
      AttributeName: attribute.name,
      KeyType: attribute.keyType,
    })),
    AttributeDefinitions: attributes.map((attribute) => ({
      AttributeName: attribute.name,
      AttributeType: attribute.type,
    })),
  };
}

/**
 * The attributes the key is made of, in key schema order.
 */
function keyAttributes(
  key: SimCfnDynamoDbTableKey,
): readonly SimCfnDynamoDbTableKeyAttribute[] {
  const partitionKey = {
    name: key.partitionKeyName,
    type: key.partitionKeyType,
    keyType: "HASH",
  };

  if (key.sortKeyName === undefined) {
    return [partitionKey];
  }

  return [
    partitionKey,
    { name: key.sortKeyName, type: key.sortKeyType, keyType: "RANGE" },
  ];
}

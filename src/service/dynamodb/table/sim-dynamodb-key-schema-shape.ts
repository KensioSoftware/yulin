/**
 * How many partition key and sort key attributes a key schema may name.
 *
 * A table and a local secondary index take one of each at most. A global
 * secondary index takes up to four of each, which AWS calls a multi-attribute
 * key.
 */
export interface SimDynamoDbKeySchemaShape {
  readonly partitionKeys: number;
  readonly sortKeys: number;
}

/**
 * The shape of a table's key, and of a local secondary index's.
 */
export const simDynamoDbSingleAttributeKeys: SimDynamoDbKeySchemaShape = {
  partitionKeys: 1,
  sortKeys: 1,
};

/**
 * The shape of a global secondary index's key.
 */
export const simDynamoDbMultiAttributeKeys: SimDynamoDbKeySchemaShape = {
  partitionKeys: 4,
  sortKeys: 4,
};

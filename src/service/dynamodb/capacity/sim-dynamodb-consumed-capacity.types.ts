/**
 * The capacity units consumed against one table or index.
 */
export interface SimDynamoDbCapacity {
  readonly CapacityUnits?: number;
  readonly ReadCapacityUnits?: number;
  readonly WriteCapacityUnits?: number;
}

/**
 * What a request consumed against one table, as `ConsumedCapacity` reports it.
 */
export interface SimDynamoDbConsumedCapacity extends SimDynamoDbCapacity {
  readonly TableName?: string;
  readonly Table?: SimDynamoDbCapacity;
  readonly GlobalSecondaryIndexes?: Readonly<
    Record<string, SimDynamoDbCapacity>
  >;
  readonly LocalSecondaryIndexes?: Readonly<
    Record<string, SimDynamoDbCapacity>
  >;
}

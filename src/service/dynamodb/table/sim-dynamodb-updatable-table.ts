import type { SimArn } from "../../aws/arn.js";
import type { SimDynamoDbSecondaryIndexes } from "../secondary-index/sim-dynamodb-secondary-indexes.js";
import type { SimDynamoDbAttributeDefinitions } from "./sim-dynamodb-attribute-definitions.js";
import type { SimDynamoDbKeySchema } from "./sim-dynamodb-key-schema.js";
import type { SimDynamoDbTableBilling } from "./sim-dynamodb-table-billing.js";

/**
 * What an update needs to know about the table it is going to be applied to.
 *
 * An index is declared against the table that will carry it, and a capacity
 * change is read against the mode the table is already billed under, so the
 * request cannot be checked without it.
 */
export interface SimDynamoDbUpdatableTable {
  readonly tableName: string;
  readonly arn: SimArn;
  readonly keySchema: SimDynamoDbKeySchema;
  readonly attributeDefinitions: SimDynamoDbAttributeDefinitions;
  readonly billing: SimDynamoDbTableBilling;
  readonly indexes: SimDynamoDbSecondaryIndexes;
}

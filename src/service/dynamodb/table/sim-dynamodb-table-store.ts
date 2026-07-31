import type { SimDynamoDbTable } from "./sim-dynamodb-table.js";
import { compareSimDynamoDbTableNames } from "./sim-dynamodb-table-order.js";
import type {
  DynamoDbTableName,
  SimDynamoDbTableName,
} from "./sim-dynamodb-table-name.js";

/**
 * The tables one simulated DynamoDB holds.
 *
 * Listing them in order lives here rather than in ListTables, because it is a
 * property of the tables rather than of the request that reads them: two
 * requests made in different orders see the same list.
 */
export class SimDynamoDbTableStore {
  private readonly tables = new Map<DynamoDbTableName, SimDynamoDbTable>();

  /**
   * Take a name for a new table.
   */
  add(table: SimDynamoDbTable): void {
    this.tables.set(table.tableName, table);
  }

  /**
   * Check whether a name is taken.
   */
  has(name: SimDynamoDbTableName): boolean {
    return this.tables.has(name.value);
  }

  /**
   * Find a table by name, if there is one.
   */
  find(name: SimDynamoDbTableName): SimDynamoDbTable | undefined {
    return this.tables.get(name.value);
  }

  /**
   * Forget a table, and the items it was holding with it.
   */
  remove(name: SimDynamoDbTableName): void {
    this.tables.delete(name.value);
  }

  /**
   * The names of every table here, in the order DynamoDB lists them.
   */
  names(): readonly string[] {
    return this.tables
      .keys()
      .toArray()
      .toSorted((first, second) => compareSimDynamoDbTableNames(first, second));
  }
}

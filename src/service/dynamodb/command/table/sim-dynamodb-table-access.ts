import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimDynamoDbResourceNotFoundException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import type { SimDynamoDbTableName } from "../../table/sim-dynamodb-table-name.js";
import { readSimDynamoDbTableReference } from "../../table/sim-dynamodb-table-reference.js";
import type { SimDynamoDbTableStore } from "../../table/sim-dynamodb-table-store.js";
import type { SimDynamoDbAuthorizer } from "../authorize/sim-dynamodb-authorizer.js";

interface SimDynamoDbTableAccessProperties {
  readonly tables: SimDynamoDbTableStore;
  readonly authorizer: SimDynamoDbAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * How a command reaches the table a request names.
 *
 * Every table command goes through the same two steps in the same order: read
 * the name or ARN the request carries, then authorize the caller against it
 * before anything looks the table up. Keeping them here is what makes that
 * order the same for all of them, so no command can accidentally tell an
 * unauthorized caller which table names are taken.
 */
export class SimDynamoDbTableAccess {
  private readonly tables: SimDynamoDbTableStore;
  private readonly authorizer: SimDynamoDbAuthorizer;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimDynamoDbTableAccessProperties) {
    this.tables = properties.tables;
    this.authorizer = properties.authorizer;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Read the name or ARN a request names its table by.
   */
  reference(tableName: string | undefined): SimDynamoDbTableName {
    return readSimDynamoDbTableReference(tableName, this.accountRegionScope);
  }

  /**
   * Find the table a request names, refusing the caller before looking it up.
   */
  required(
    action: string,
    tableName: string | undefined,
    caller: SimAwsCaller | undefined,
  ): SimDynamoDbTable {
    return this.requiredByName(action, this.reference(tableName), caller);
  }

  /**
   * Find a table by a name that has already been read.
   */
  requiredByName(
    action: string,
    name: SimDynamoDbTableName,
    caller: SimAwsCaller | undefined,
  ): SimDynamoDbTable {
    this.authorizer.authorizeTable(action, name.value, caller);

    const table = this.tables.find(name);
    if (table === undefined) {
      throw new SimDynamoDbResourceNotFoundException(
        `No DynamoDB Table named ${name.value}`,
      );
    }

    return table;
  }

  /**
   * Ensure the caller may perform an action that names no particular table.
   */
  authorizeAnyTable(action: string, caller: SimAwsCaller | undefined): void {
    this.authorizer.authorizeAnyTable(action, caller);
  }
}

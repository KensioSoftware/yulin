import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { SimDynamoDbResourceNotFoundException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import type { SimDynamoDbTableName } from "../../table/sim-dynamodb-table-name.js";
import { readSimDynamoDbTableReference } from "../../table/sim-dynamodb-table-reference.js";
import type { SimDynamoDbTableStore } from "../../table/sim-dynamodb-table-store.js";
import type { SimDynamoDbAuthorizer } from "../authorize/sim-dynamodb-authorizer.js";
import type { SimDynamoDbLeadingKeys } from "../authorize/sim-dynamodb-leading-keys.js";

/**
 * Read the partition key values a request reaches, or none where they cannot
 * be read.
 *
 * Authorization runs ahead of the checks a command makes on what it was given,
 * as it does on AWS. A request whose key or key condition is malformed is
 * authorized carrying no values and refused by the check that follows, so
 * whatever reading them throws is dropped here.
 */
function readLeadingKeys(
  leadingKeys: SimDynamoDbLeadingKeys | undefined,
  table: SimDynamoDbTable,
): readonly string[] | undefined {
  try {
    return leadingKeys?.(table);
  } catch {
    return undefined;
  }
}

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
 * before the command is told whether the table is there. Keeping them here is
 * what makes that order the same for all of them, so no command can
 * accidentally tell an unauthorized caller which table names are taken.
 *
 * A command reaching particular items hands over how to read their partition
 * key values, which authorization needs the table to read. The table is found
 * first for that, and a caller refused against a table that is not there still
 * hears AccessDenied rather than a missing table.
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
   * Find the table a request names, refusing the caller before answering.
   */
  required(
    action: string,
    tableName: string | undefined,
    caller: SimAwsCaller | undefined,
    leadingKeys?: SimDynamoDbLeadingKeys,
  ): SimDynamoDbTable {
    return this.requiredByName(
      action,
      this.reference(tableName),
      caller,
      leadingKeys,
    );
  }

  /**
   * Find a table by a name that has already been read.
   *
   * A caller with no permission hears AccessDenied whether or not the table is
   * there, which keeps an unauthorized caller from finding out which table
   * names are taken.
   */
  requiredByName(
    action: string,
    name: SimDynamoDbTableName,
    caller: SimAwsCaller | undefined,
    leadingKeys?: SimDynamoDbLeadingKeys,
  ): SimDynamoDbTable {
    const table = this.tables.find(name);

    this.authorizer.authorizeTable(
      action,
      name.value,
      caller,
      table === undefined ? undefined : readLeadingKeys(leadingKeys, table),
    );

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

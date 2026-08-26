import { faker } from "@faker-js/faker";

import type { SimGlue } from "./sim-glue.js";

/**
 * Test support for building a partitioned table to register partitions
 * against.
 *
 * Every partition behaviour worth testing needs a database and a table with
 * partition keys before it can be reached, so building those happens here
 * rather than at the top of every test.
 *
 * These helpers drive the simulator through structural command shapes rather
 * than real SDK command objects, because this is source rather than a test
 * file. The colocated tests cover SDK-shaped input.
 */

/** A table name nothing else in the run will use. */
export function fixtureTableName(): string {
  return `access_logs_${faker.string.alphanumeric(8)}`;
}

/** A database name nothing else in the run will use. */
export function fixtureDatabaseName(): string {
  return `site_logs_${faker.string.alphanumeric(8)}`;
}

/**
 * What a partitioned table is created with here.
 */
export interface FixturePartitionedTable {
  readonly databaseName: string;
  readonly tableName: string;
}

/**
 * Create a database and a table partitioned by the named keys, all of them
 * strings.
 *
 * The keys default to one `day`. That is the shape most of these tests want.
 * One value per partition means a list of two values is refused by count.
 */
export function createFixturePartitionedTable(
  glue: SimGlue,
  partitionKeyNames: readonly string[] = ["day"],
): FixturePartitionedTable {
  return createFixtureTypedTable(
    glue,
    partitionKeyNames.map((Name) => ({ Name, Type: "string" })),
  );
}

/**
 * Create a database and a table partitioned by keys of the declared types.
 *
 * The type is what decides whether an expression compares a key numerically,
 * so a test about that declares it here.
 */
export function createFixtureTypedTable(
  glue: SimGlue,
  partitionKeys: readonly {
    readonly Name: string;
    readonly Type?: string | undefined;
  }[],
): FixturePartitionedTable {
  const databaseName = fixtureDatabaseName();
  const tableName = fixtureTableName();

  glue.createDatabase({ input: { DatabaseInput: { Name: databaseName } } });
  glue.createTable({
    input: {
      DatabaseName: databaseName,
      TableInput: {
        Name: tableName,
        PartitionKeys: partitionKeys,
        StorageDescriptor: { Location: `s3://${databaseName}/logs/` },
      },
    },
  });

  return { databaseName, tableName };
}

/**
 * Register one partition against a fixture table.
 */
export function createFixturePartition(
  glue: SimGlue,
  table: FixturePartitionedTable,
  values: readonly string[],
): void {
  glue.createPartition({
    input: {
      DatabaseName: table.databaseName,
      TableName: table.tableName,
      PartitionInput: {
        Values: values,
        StorageDescriptor: {
          Location: `s3://${table.databaseName}/logs/day=${values.join("/")}/`,
        },
      },
    },
  });
}

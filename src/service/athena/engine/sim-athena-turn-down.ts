import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";

/** How every reason opens, so a test can match one without matching all of it. */
const engine = "The simulated Athena query engine";

/** What a strict engine tells a test to do about the query it failed. */
const alternatives =
  `Declare what this query answers with through results(), or leave strict ` +
  `mode off to fall back to a declaration.`;

/** Nothing in scope holds the objects a query would read. */
export const simAthenaNoObjects = `${engine} has no simulated S3 to read this query's objects from.`;

/** The statement could not be written back out for SQLite. */
export const simAthenaUnreadableStatement =
  `${engine} cannot run this statement. The Athena grammar refused it, or it ` +
  `uses something SQLite has not got.`;

/** Whatever went wrong while the tables were loaded or the statement ran. */
export function simAthenaRunFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return `${engine} could not answer this statement. ${message}`;
}

/**
 * One table the engine has no reader for.
 *
 * The SerDe is what decides, so the SerDe is what the reason names. A table
 * carrying none is its own case, because there is nothing to name and nothing
 * else in the catalog says what its objects hold.
 */
export function simAthenaUnreadableFormat(
  table: SimAthenaCatalogTable,
): string {
  const name = `${table.databaseName}.${table.name}`;
  const serDe = table.storageDescriptor?.SerdeInfo?.SerializationLibrary;

  if (serDe === undefined) {
    return (
      `Table ${name} declares no SerDe, and ${engine.toLowerCase()} has ` +
      `nothing to say what its objects hold.`
    );
  }

  return `${engine} has no reader for ${serDe}, which table ${name} declares.`;
}

/** One turn-down, as the reason a strict engine fails the query with. */
export function simAthenaStrictRefusal(turnedDown: string): string {
  return `${turnedDown} ${alternatives}`;
}

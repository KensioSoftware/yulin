/**
 * One table a query names, as the query wrote it.
 *
 * The catalog and the database are held only where the query qualified them.
 * Resolving an unqualified name against the execution's database is the
 * catalog's job rather than the scanner's.
 */
export interface SimAthenaTableReference {
  readonly catalog: string | undefined;
  readonly database: string | undefined;
  readonly name: string;

  /** Where the name starts in the query text, for the position in an error. */
  readonly index: number;
}

/** The catalog Athena queries when a query names none. */
export const defaultAthenaCatalog = "awsdatacatalog";

/**
 * The schema Athena answers about its own metadata from.
 *
 * A query against it resolves without the Data Catalog holding anything,
 * because Athena serves it rather than the catalog.
 */
export const informationSchemaName = "information_schema";

/**
 * How a reference reads back in an error, qualified the way Athena qualifies
 * one.
 */
export function simAthenaTableReferenceText(
  reference: SimAthenaTableReference,
  database: string | undefined,
): string {
  const parts = [
    reference.catalog ?? defaultAthenaCatalog,
    reference.database ?? database ?? "",
    reference.name,
  ];

  return parts.join(".");
}

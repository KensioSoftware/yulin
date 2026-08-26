import { simAthenaSqlPosition } from "./sim-athena-sql-tokens.js";
import {
  defaultAthenaCatalog,
  informationSchemaName,
  simAthenaFoldedName,
  simAthenaTableReferenceText,
  type SimAthenaTableReference,
} from "./sim-athena-table-reference.js";
import type { SimAthenaCatalogTable } from "./sim-athena-catalog-table.js";
import type { SimAthenaCatalogPartition } from "./sim-athena-registered-partitions.js";
import { simAthenaTableReferences } from "./sim-athena-table-references.js";

/**
 * The narrow slice of the simulated Glue Data Catalog that resolving a table
 * needs.
 *
 * `SimGlue` structurally implements this, the way `SimS3` implements
 * `SimAthenaResultDestination`.
 */
export interface SimAthenaCatalog {
  allDatabases(): readonly unknown[];
  findTable(
    databaseName: string,
    name: string,
  ): SimAthenaCatalogTable | undefined;
  partitionsInTable(
    databaseName: string,
    name: string,
  ): readonly SimAthenaCatalogPartition[];
}

/** What resolving a query's tables came to. */
export interface SimAthenaResolvedTables {
  /** Why the query cannot run, where a table it names is absent. */
  readonly refusal: string | undefined;

  /** The catalog entries the query reads, for whatever comes next. */
  readonly tables: readonly SimAthenaCatalogTable[];
}

/** What one query is resolved against. */
export interface SimAthenaTableResolutionRequest {
  readonly queryString: string;
  readonly database: string | undefined;
  readonly catalog: string | undefined;
}

/**
 * Resolve the tables a query names against this catalog.
 *
 * Resolution is skipped altogether for a query the scanner cannot follow, for
 * a statement that writes data, and for a catalog other than
 * `awsdatacatalog`. Simulated Athena answering a query real Athena would
 * answer matters more here than catching every absent table.
 *
 * It is skipped for an empty catalog as well. A simulation holding no database
 * is one where nothing declared a table, and a query there is answered from a
 * declaration the way it was before this existed. Deploying the first database
 * is what turns resolution on.
 */
export function simAthenaResolveTables(
  request: SimAthenaTableResolutionRequest,
  catalog: SimAthenaCatalog | undefined,
): SimAthenaResolvedTables {
  if (
    catalog === undefined ||
    catalog.allDatabases().length === 0 ||
    isFederated(request.catalog)
  ) {
    return { refusal: undefined, tables: [] };
  }

  const read = simAthenaTableReferences(request.queryString);

  if (!read.readable) {
    return { refusal: undefined, tables: [] };
  }

  const tables: SimAthenaCatalogTable[] = [];

  for (const reference of read.references) {
    if (isFederated(reference.catalog) || isInformationSchema(reference)) {
      continue;
    }

    const declared = reference.database ?? request.database;
    const database =
      declared === undefined ? undefined : simAthenaFoldedName(declared);
    const found =
      database === undefined
        ? undefined
        : catalog.findTable(database, simAthenaFoldedName(reference.name));

    if (found === undefined) {
      return { refusal: refusalFor(reference, request, database), tables: [] };
    }

    tables.push(found);
  }

  return { refusal: undefined, tables };
}

function refusalFor(
  reference: SimAthenaTableReference,
  request: SimAthenaTableResolutionRequest,
  database: string | undefined,
): string {
  const position = simAthenaSqlPosition(request.queryString, reference.index);
  const at = `line ${String(position.line)}:${String(position.column)}`;

  if (database === undefined) {
    return (
      `SYNTAX_ERROR: ${at}: Schema must be specified when session schema ` +
      `is not set`
    );
  }

  return (
    `SYNTAX_ERROR: ${at}: Table ` +
    `${simAthenaTableReferenceText(reference, database)} does not exist`
  );
}

/**
 * Whether this names a catalog other than the Data Catalog.
 *
 * A federated catalog is somewhere this simulation has never looked, so a
 * query against one is left to run.
 */
function isFederated(catalog: string | undefined): boolean {
  return (
    catalog !== undefined && catalog.toLowerCase() !== defaultAthenaCatalog
  );
}

function isInformationSchema(reference: SimAthenaTableReference): boolean {
  return reference.database?.toLowerCase() === informationSchemaName;
}

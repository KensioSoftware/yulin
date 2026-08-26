import { simAthenaSqlPosition } from "./sim-athena-sql-tokens.js";
import {
  defaultAthenaCatalog,
  informationSchemaName,
  simAthenaTableReferenceText,
  type SimAthenaTableReference,
} from "./sim-athena-table-reference.js";
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
  findTable(databaseName: string, name: string): unknown;
}

/** What one query is resolved against. */
export interface SimAthenaTableResolutionRequest {
  readonly queryString: string;
  readonly database: string | undefined;
  readonly catalog: string | undefined;
}

/**
 * Why a query cannot run against this catalog, where a table it names is
 * absent.
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
export function simAthenaTableRefusal(
  request: SimAthenaTableResolutionRequest,
  catalog: SimAthenaCatalog | undefined,
): string | undefined {
  if (
    catalog === undefined ||
    catalog.allDatabases().length === 0 ||
    isFederated(request.catalog)
  ) {
    return undefined;
  }

  const read = simAthenaTableReferences(request.queryString);

  if (!read.readable) {
    return undefined;
  }

  for (const reference of read.references) {
    const refusal = refusalFor(reference, request, catalog);

    if (refusal !== undefined) {
      return refusal;
    }
  }

  return undefined;
}

function refusalFor(
  reference: SimAthenaTableReference,
  request: SimAthenaTableResolutionRequest,
  catalog: SimAthenaCatalog,
): string | undefined {
  if (isFederated(reference.catalog) || isInformationSchema(reference)) {
    return undefined;
  }

  const database = reference.database ?? request.database;
  const position = simAthenaSqlPosition(request.queryString, reference.index);
  const at = `line ${String(position.line)}:${String(position.column)}`;

  if (database === undefined) {
    return (
      `SYNTAX_ERROR: ${at}: Schema must be specified when session schema ` +
      `is not set`
    );
  }

  if (catalog.findTable(database, reference.name) !== undefined) {
    return undefined;
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

import type {
  SimAthenaDeclaredColumn,
  SimAthenaDeclaredResult,
} from "./sim-athena-declared-result.js";

/**
 * The type a column reports when a declaration names none.
 */
const defaultColumnType = "varchar";

/**
 * One declared result, read into the shape the query lifecycle works with.
 *
 * A declaration is deliberately loose, since a test writing one cares about
 * the rows. This fills in what it left out, and it is the only place that
 * knows how.
 */
export class SimAthenaResolvedResult {
  public readonly columns: readonly SimAthenaDeclaredColumn[];
  public readonly rows: readonly (readonly string[])[];
  public readonly bytesScanned: number;

  /**
   * What the declaration said the query scanned, where it said anything.
   *
   * A query with none of its own is measured against the objects it reads.
   * Telling a declared zero from an absent one is what makes that possible.
   */
  public readonly declaredBytesScanned: number | undefined;
  public readonly failsWith: string | undefined;

  constructor(declared: SimAthenaDeclaredResult) {
    this.rows = declared.rows ?? [];
    this.columns = resolvedColumns(declared, this.rows);
    this.bytesScanned = declared.bytesScanned ?? 0;
    this.declaredBytesScanned = declared.bytesScanned;
    this.failsWith = declared.failsWith;
  }

  /**
   * Whether this result says the query should fail.
   */
  get fails(): boolean {
    return this.failsWith !== undefined;
  }
}

/**
 * The columns a result set reports.
 *
 * A declaration naming none is given one per value in the first row, called
 * `_col0` upward, which is what Athena calls a column a query left unnamed.
 */
function resolvedColumns(
  declared: SimAthenaDeclaredResult,
  rows: readonly (readonly string[])[],
): readonly SimAthenaDeclaredColumn[] {
  const columns = declared.columns;

  if (columns !== undefined) {
    return columns.map(namedColumn);
  }

  return (rows[0] ?? []).map((_value, index) => ({
    name: `_col${String(index)}`,
    type: defaultColumnType,
  }));
}

function namedColumn(
  column: string | SimAthenaDeclaredColumn,
): SimAthenaDeclaredColumn {
  if (typeof column === "string") {
    return { name: column, type: defaultColumnType };
  }

  return { name: column.name, type: column.type ?? defaultColumnType };
}
